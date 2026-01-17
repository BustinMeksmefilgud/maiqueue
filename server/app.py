import random
from datetime import timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import FieldFilter
import datetime
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)
CORS(app)

# 1. Initialize Firebase Admin
# Check if app is already initialized to avoid errors during reloads
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

PLAY_STYLE_WEIGHTS = {
    "Casual": 1,
    "Chiho Grinder": 3,
    "14k Spammer": 4,
    "Lone Wolf": 0, # Unlikely to want a partner
    "Solo Boring": 2
}

def get_separated_user_stats(player_ids):
    """
    Returns specific stats for P1 and P2.
    If P2 is missing, fills with 0/"None".
    """
    # 1. Fetch all user docs
    users_data = []
    for uid in player_ids:
        doc = db.collection('users').document(uid).get()
        if doc.exists:
            users_data.append(doc.to_dict())
    
    # 2. Extract P1 (Host)
    # Default to 0/"Casual" if for some reason list is empty
    p1 = users_data[0] if len(users_data) > 0 else {}
    p1_rank = p1.get('rank', 0)
    p1_style = p1.get('playStyle', 'Casual')

    # 3. Extract P2 (Guest/Partner)
    # Default to 0/"None" if they don't exist
    if len(users_data) > 1:
        p2 = users_data[1]
        p2_rank = p2.get('rank', 0)
        p2_style = p2.get('playStyle', 'Casual')
    else:
        p2_rank = 0
        p2_style = "None" # Important: This tells AI "Nobody is here"

    return {
        'p1_rank': p1_rank,
        'p1_style': p1_style,
        'p2_rank': p2_rank,
        'p2_style': p2_style,
        'player_count': len(users_data) or 1
    }

def get_historical_queue_data_separated(branch_id):
    docs = db.collection('queue')\
        .where(filter=FieldFilter('branchId', '==', branch_id))\
        .where(filter=FieldFilter('status', '==', 'completed'))\
        .order_by('endedAt', direction=firestore.Query.DESCENDING)\
        .limit(50)\
        .stream()

    data = []
    for doc in docs:
        d = doc.to_dict()
        if d.get('startedAt') and d.get('endedAt'):
            duration = (d['endedAt'].timestamp() - d['startedAt'].timestamp()) / 60
            
            if 5 < duration < 40:
                # UNPACK P1 and P2
                stats = get_separated_user_stats(d.get('players', []))
                
                data.append({
                    'duration': duration,
                    'players': stats['player_count'],
                    'p1_rank': stats['p1_rank'],
                    'p1_style': stats['p1_style'],
                    'p2_rank': stats['p2_rank'],
                    'p2_style': stats['p2_style']
                })
    
    return pd.DataFrame(data)

@app.route('/api/predict-wait', methods=['POST'])
def predict_wait():
    try:
        data = request.json
        branch_id_input = data.get('branchId', 'sisa')
        
        # --- STEP 1: FETCH BRANCH CAPACITY ---
        # Handles case-sensitivity (tries 'sisa' then 'SISA')
        branch_ref = db.collection('branches').document(branch_id_input)
        branch_doc = branch_ref.get()
        if not branch_doc.exists:
             branch_ref = db.collection('branches').document(branch_id_input.upper())
             branch_doc = branch_ref.get()
        branch_capacity = 1
        if branch_doc.exists:
            branch_capacity = branch_doc.to_dict().get('cabinetCount', 1)

        # --- STEP 2: FETCH UPCOMING QUEUE ---
        queue_docs = db.collection('queue')\
            .where(filter=FieldFilter('branchId', '==', branch_id_input))\
            .where(filter=FieldFilter('status', '==', 'queued'))\
            .order_by('createdAt')\
            .stream()
        queue_list = [doc.to_dict() for doc in queue_docs]


        # --- STEP 3: TRAIN AI MODEL (The "Brain") ---
        df_history = get_historical_queue_data_separated(branch_id_input)
        model = None
        calculation_method = "static_math" # Default fallback

        # We need at least ~10 games to safely train the model
        if len(df_history) > 10:
            try:
                # X = Features (Players, P1 Info, P2 Info)
                # y = Target (Actual Duration)
                X = df_history[['players', 'p1_rank', 'p1_style', 'p2_rank', 'p2_style']]
                y = df_history['duration']
                
                # PREPROCESSING PIPELINE
                preprocessor = ColumnTransformer(
                    transformers=[
                        # Convert Text Styles to Numbers (One-Hot Encoding)
                        ('cat', OneHotEncoder(handle_unknown='ignore'), ['p1_style', 'p2_style']),
                        # Keep Numbers as they are (impute missing with mean just in case)
                        ('num', SimpleImputer(strategy='mean'), ['players', 'p1_rank', 'p2_rank'])
                    ]
                )
                
                # Combine Processor + Linear Regression
                model = make_pipeline(preprocessor, LinearRegression())
                model.fit(X, y)
                calculation_method = "ai_multivariate_regression"
                
            except Exception as e:
                print(f"AI Training Failed (Falling back to math): {e}")

        # --- STEP 4: DEFINE PREDICTION FUNCTION ---
        def predict_duration_for_group(item):
            """
            Predicts how long a SPECIFIC group (Solo/Duo) will take.
            """
            # Unpack the waiting group data exactly like we unpacked history
            stats = get_separated_user_stats(item.get('players', []))
            
            if model:
                try:
                    # Create a DataFrame row for the AI input
                    input_df = pd.DataFrame([{
                        'players': stats['player_count'],
                        'p1_rank': stats['p1_rank'],
                        'p1_style': stats['p1_style'],
                        'p2_rank': stats['p2_rank'],
                        'p2_style': stats['p2_style']
                    }])
                    
                    prediction = model.predict(input_df)[0]
                    # Clamp result: Min 5 mins, Max 30 mins (to prevent AI glitches)
                    return max(5.0, min(prediction, 30.0))
                except Exception as e:
                    print(f"Prediction Error: {e}")

            # Fallback Math Strategy (if AI failed or no model)
            # Logic: (Songs * 3.5m) + 1.5m Overhead
            songs = 4 if stats['player_count'] >= 2 else 3
            return (songs * 3.5) + 1.5

        # --- STEP 5: RUN MULTI-MACHINE SIMULATION ---
        machine_clocks = [0] * branch_capacity
        print(f"Machines: {machine_clocks}")
        now = datetime.datetime.now(datetime.timezone.utc)

        # A. Account for ACTIVE games (Currently Playing)
        active_docs = db.collection('queue')\
            .where(filter=FieldFilter('branchId', '==', branch_id_input))\
            .where(filter=FieldFilter('status', '==', 'playing'))\
            .stream()
            
        for i, doc in enumerate(active_docs):
            if i < len(machine_clocks):
                d = doc.to_dict()
                elapsed = (now.timestamp() - d['startedAt'].timestamp()) / 60 if d.get('startedAt') else 0
                
                # Ask AI: How long should THIS active group take total?
                total_expected = predict_duration_for_group(d)
                
                remaining = max(total_expected - elapsed, 1.0)
                machine_clocks[i] = remaining

        # B. Process the WAITING line
        for item in queue_list:
            # Ask AI: How long will THIS waiting group take?
            game_duration = predict_duration_for_group(item)
            print(f"Game Duration: ", game_duration)
            
            # Assign this group to the machine that becomes free soonest
            next_free_machine_index = machine_clocks.index(min(machine_clocks))
            machine_clocks[next_free_machine_index] += game_duration

        # The estimated wait is the lowest time on the clocks
        estimated_wait = min(machine_clocks)

        return jsonify({
            "estimated_minutes": round(estimated_wait, 2),
            "queue_length": len(queue_list),
            "active_machines": branch_capacity,
            "method": calculation_method
        })

    except Exception as e:
        print(f"Server Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/find-partner', methods=['POST'])
def find_partner():
    """
    AI-POWERED PARTNER FINDER (KNN)
    Uses K-Nearest Neighbors to find players with similar Rank and PlayStyle intensity.
    """
    try:
        req_data = request.json
        requester_id = req_data.get('userId')
        branch_id = req_data.get('branchId')
        
        partners_stream = db.collection('users')\
            .where(filter=FieldFilter('branchId', '==', branch_id))\
            .where(filter=FieldFilter('status', '==', 'waiting'))\
            .stream()

        users_list = []
        requester_data = None
        
        for doc in partners_stream:
            d = doc.to_dict()
            uid = doc.id
            
            # Save the requester separately so we know who to match against
            if uid == requester_id:
                requester_data = d
            
            # Convert PlayStyle string to a Number (Intensity)
            # "Casual" -> 1, "14k Spammer" -> 4
            style_str = d.get('playStyle', 'Casual')
            style_score = PLAY_STYLE_WEIGHTS.get(style_str, 1)

            users_list.append({
                'uid': uid,
                'username': d.get('username', 'Unknown'),
                'rank': d.get('rank', 0),
                'style_score': style_score, # AI needs numbers, not text
                'playStyle': style_str
            })

        if not requester_data or len(users_list) < 2:
            return jsonify({
                "requester": requester_data.get('username') if requester_data else "Unknown",
                "matches": [],
                "message": "No other players found in waiting list."
            })

        # --- STEP 2: PREPARE DATA FOR AI ---
        df = pd.DataFrame(users_list)
        
        # X = The Features (Rank, Style Intensity)
        X = df[['rank', 'style_score']].values

        # IMPORTANT: Feature Scaling
        # Rank is 0-15000, Style is 0-4. Without scaling, Rank dominates the distance.
        # StandardScaler balances them so the AI considers both equally.
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # --- STEP 3: TRAIN KNN MODEL ---
        # We want the top 5 matches (plus 1 for the user themselves)
        k = min(len(users_list), 6) 
        
        # Initialize AI Model
        knn = NearestNeighbors(n_neighbors=k, algorithm='auto', metric='euclidean')
        knn.fit(X_scaled) # "Train" on the current waiting room

        # --- STEP 4: PREDICT (FIND NEIGHBORS) ---
        # Find the row index of the requester
        req_index = df[df['uid'] == requester_id].index[0]
        req_features = X_scaled[req_index].reshape(1, -1)
        
        # Ask AI: "Who is closest to this user?"
        distances, indices = knn.kneighbors(req_features)

        # --- STEP 5: FORMAT RESULTS ---
        matches = []
        # Skip the first result (index 0) because it is the user themselves!
        for i in range(1, len(distances[0])):
            idx = indices[0][i]   # The index in our DataFrame
            dist = distances[0][i] # The "AI Distance" (Compatibility Score)
            
            matched_user = df.iloc[idx]
            
            matches.append({
                "uid": matched_user['uid'],
                "username": matched_user['username'],
                "rank": int(matched_user['rank']),
                "playStyle": matched_user['playStyle'],
                "compatibility_score": round(dist, 4) # Lower distance = Better Match
            })

        return jsonify({
            "requester": requester_data.get('username'),
            "matches": matches,
            "method": "AI_KNN_Clustering"
        })

    except Exception as e:
        print(f"KNN Error: {e}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/seed-history', methods=['POST'])
def seed_history():
    try:
        # 1. FETCH REAL USERS
        # We need their IDs to make the data look real
        users_ref = db.collection('users').stream()
        user_list = [u.id for u in users_ref]

        if len(user_list) < 2:
            return jsonify({"error": "Not enough users in DB to seed data! Create at least 2 users first."}), 400

        batch = db.batch()
        count = 0
        
        # 2. GENERATE 50 MOCK SESSIONS
        # We simulate games happening over the last 7 days
        for i in range(50):
            # A. Pick Random Branch & Type
            branch = random.choice(['sisa', 'jmall'])
            game_type = random.choice(['solo', 'sync'])
            
            # B. Pick Random Players
            if game_type == 'solo':
                players = [random.choice(user_list)]
            else:
                # Pick 2 distinct users
                players = random.sample(user_list, 2)
            
            # C. Generate Realistic Timestamps
            # Random time in the last 7 days
            days_ago = random.randint(0, 7)
            hours_ago = random.randint(0, 23)
            start_time = datetime.datetime.now(datetime.timezone.utc) - timedelta(days=days_ago, hours=hours_ago)
            
            # D. Generate Realistic Duration (The "Pattern" for AI)
            # Solo = 10-14 mins, Sync = 15-22 mins
            if game_type == 'solo':
                duration_mins = random.uniform(10.0, 14.0)
            else:
                duration_mins = random.uniform(15.0, 22.0)
                
            # Add some randomness for "Slow Players" vs "Fast Players"
            duration_mins += random.uniform(-1.0, 3.0) 
            
            end_time = start_time + timedelta(minutes=duration_mins)

            # E. Create the Document
            new_ref = db.collection('queue').document()
            
            # Mock Data Object
            doc_data = {
                'sessionId': new_ref.id,
                'branchId': branch,
                'type': game_type,
                'status': 'completed',
                'players': players,
                'playerCount': len(players),
                'startedAt': start_time,
                'endedAt': end_time,
                'createdAt': start_time - timedelta(minutes=5), # Queued 5 mins before
                'isMock': True # <--- THE INDICATOR
            }
            
            batch.set(new_ref, doc_data)
            count += 1

            # Firestore batches strictly limit to 500 ops. 
            # We commit every 50 to be safe and clean.
            if count % 50 == 0:
                batch.commit()
                batch = db.batch() # Start new batch

        # Commit any remaining
        if count % 50 != 0:
            batch.commit()

        return jsonify({
            "message": f"Successfully seeded {count} mock history items!",
            "note": "These items have 'isMock: true' so you can query/delete them easily."
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/clear-mock-data', methods=['DELETE'])
def clear_mock_data():
    try:
        # Find all docs with isMock == True
        docs = db.collection('queue').where('isMock', '==', True).stream()
        
        deleted = 0
        batch = db.batch()
        
        for doc in docs:
            batch.delete(doc.reference)
            deleted += 1
            
            if deleted % 50 == 0:
                batch.commit()
                batch = db.batch()
                
        if deleted % 50 != 0:
            batch.commit()
            
        return jsonify({"message": f"Deleted {deleted} mock records."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)