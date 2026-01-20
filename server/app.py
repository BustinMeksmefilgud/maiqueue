import os
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
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

app = Flask(__name__)
CORS(app)

# 1. Initialize Firebase Admin
# Check if app is already initialized to avoid errors during reloads
if not firebase_admin._apps:
    
    key_path = os.environ.get('FIREBASE_KEY_PATH', 'serviceAccountKey.json')
    cred = credentials.Certificate(key_path)
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
    
def get_all_historical_queue_data():
    docs = db.collection('queue')\
        .where(filter=FieldFilter('status', '==', 'completed'))\
        .order_by('endedAt', direction=firestore.Query.DESCENDING)\
        .limit(200)\
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
        user_id_input = data.get('userId')
        
        # --- Fetch numbeer of machines on branch ---
        branch_ref = db.collection('branches').document(branch_id_input)
        branch_doc = branch_ref.get()
        branch_capacity = 1
        if branch_doc.exists:
            branch_capacity = branch_doc.to_dict().get('cabinetCount', 1)

        # --- Fetch queue ---
        queue_docs = db.collection('queue')\
            .where(filter=FieldFilter('branchId', '==', branch_id_input))\
            .where(filter=FieldFilter('status', '==', 'queued'))\
            .order_by('createdAt')\
            .stream()
        queue_list = [doc.to_dict() for doc in queue_docs]


        # --- Model Training ---
        df_history = get_historical_queue_data_separated(branch_id_input)
        model = None
        calculation_method = "static_math" 

        # We need at least 10 games to safely train the model
        if len(df_history) > 10:
            try:
                X = df_history[['players', 'p1_rank', 'p1_style', 'p2_rank', 'p2_style']]
                y = df_history['duration']
                
                preprocessor = ColumnTransformer(
                    transformers=[
                        ('cat', OneHotEncoder(handle_unknown='ignore'), ['p1_style', 'p2_style']),
                        ('num', SimpleImputer(strategy='mean'), ['players', 'p1_rank', 'p2_rank'])
                    ]
                )
                
                # Combine Processor + Linear Regression
                model = make_pipeline(preprocessor, LinearRegression())
                model.fit(X, y)
                calculation_method = "ai_multivariate_regression"
                
            except Exception as e:
                print(f"AI Training Failed (Falling back to math): {e}")

        # --- Function for prediction ---
        def predict_duration_for_group(item):
            """
            Predicts how long a SPECIFIC group (Solo/Duo) will take.
            """
            stats = get_separated_user_stats(item.get('players', []))
            
            if model:
                try:
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

        # --- Simulating for multiple machines ---
        machine_clocks = [0] * branch_capacity
        now = datetime.datetime.now(datetime.timezone.utc)

        found_user_wait_time = None

        # Fetch Active Games
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

        # Process the WAITING line
        for item in queue_list:
            game_duration = predict_duration_for_group(item)
            
            # Assign this group to the machine that becomes free soonest
            next_free_machine_index = machine_clocks.index(min(machine_clocks))
            start_time_for_this_group = machine_clocks[next_free_machine_index]
            if user_id_input and user_id_input in item.get('players', []):
                found_user_wait_time = start_time_for_this_group
            
            machine_clocks[next_free_machine_index] += game_duration

        # The estimated wait is the lowest time on the clocks
        if found_user_wait_time is not None:
            final_estimated_wait = found_user_wait_time
            in_queue = True
        else:
            final_estimated_wait = min(machine_clocks)
            in_queue = False

        return jsonify({
            "estimated_minutes": round(final_estimated_wait, 2),
            "queue_length": len(queue_list),
            "active_machines": branch_capacity,
            "method": calculation_method,
            "in_queue": in_queue
        })

    except Exception as e:
        print(f"Server Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/find-partner', methods=['POST'])
def find_partner():
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
            
            if uid == requester_id:
                requester_data = d
            
            style_str = d.get('playStyle', 'Casual')
            style_score = PLAY_STYLE_WEIGHTS.get(style_str, 1)

            users_list.append({
                'uid': uid,
                'username': d.get('username', 'Unknown'),
                'rank': d.get('rank', 0),
                'style_score': style_score, 
                'playStyle': style_str
            })

        if not requester_data or len(users_list) < 2:
            return jsonify({
                "requester": requester_data.get('username') if requester_data else "Unknown",
                "matches": [],
                "message": "No other players found in waiting list."
            })

        # --- prepare data ---
        df = pd.DataFrame(users_list)
        
        X = df[['rank', 'style_score']].values

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # --- train model---
        k = min(len(users_list), 6) 
        
        knn = NearestNeighbors(n_neighbors=k, algorithm='auto', metric='euclidean')
        knn.fit(X_scaled)

        # --- predict ---
        req_index = df[df['uid'] == requester_id].index[0]
        req_features = X_scaled[req_index].reshape(1, -1)
        distances, indices = knn.kneighbors(req_features)

        # --- results ---
        matches = []
        # Skip the first result (index 0) because it is the user themselves!
        for i in range(1, len(distances[0])):
            idx = indices[0][i] 
            dist = distances[0][i]
            
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
    
@app.route('/api/test-wait-accuracy', methods=['GET'])
def test_wait_accuracy():
    try:
        # 1. Fetch ALL historical data
        # (We use 'sisa' or any branch that has data)
        df = get_all_historical_queue_data()

        if len(df) < 20:
            return jsonify({"error": "Not enough data. Seed at least 20 games first."})

        # 2. Prepare Data
        X = df[['players', 'p1_rank', 'p1_style', 'p2_rank', 'p2_style']]
        y = df['duration']

        # 3. SPLIT: 80% for Training, 20% for Testing
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # 4. Build Pipeline (Same as your real function)
        preprocessor = ColumnTransformer(
            transformers=[
                ('cat', OneHotEncoder(handle_unknown='ignore'), ['p1_style', 'p2_style']),
                ('num', SimpleImputer(strategy='mean'), ['players', 'p1_rank', 'p2_rank'])
            ]
        )
        model = make_pipeline(preprocessor, LinearRegression())

        # 5. Train on the 80%
        model.fit(X_train, y_train)

        # 6. Test on the hidden 20%
        predictions = model.predict(X_test)

        # 7. Calculate Accuracy Metrics
        mae = mean_absolute_error(y_test, predictions)
        r2 = r2_score(y_test, predictions)

        return jsonify({
            "total_samples": len(df),
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "mean_absolute_error": round(mae, 2), # <--- THE IMPORTANT NUMBER
            "r2_score": round(r2, 4),
            "interpretation": f"On average, the AI's prediction is off by {round(mae, 2)} minutes."
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/test-partner-accuracy', methods=['GET'])
def test_partner_accuracy():
    try:
        # 1. Create a Fake Target (You)
        # Rank 1000, Casual
        target_user = { 'uid': 'me', 'rank': 1000, 'style_score': 1 } # Casual=1

        # 2. Create Fake Candidates
        candidates = [
            # Candidate A: Perfect Match (Rank 1050, Casual) -> Distance should be tiny
            { 'uid': 'A', 'username': 'Perfect Match', 'rank': 1050, 'style_score': 1, 'playStyle': 'Casual' },
            
            # Candidate B: Okay Match (Rank 3000, Casual) -> Rank is far, Style is good
            { 'uid': 'B', 'username': 'Rank Gap', 'rank': 3000, 'style_score': 1, 'playStyle': 'Casual' },
            
            # Candidate C: Bad Match (Rank 1000, Spammer) -> Rank is close, Style is opposite
            { 'uid': 'C', 'username': 'Style Clash', 'rank': 1000, 'style_score': 4, 'playStyle': '14k Spammer' }
        ]

        # 3. Prepare Data for KNN
        # Combine target + candidates into one list
        all_users = [target_user] + candidates
        df = pd.DataFrame(all_users)
        
        X = df[['rank', 'style_score']].values

        # IMPORTANT: Use the scaler!
        # This checks if your scaling logic is working (Rank vs Style weight)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # 4. Train KNN
        knn = NearestNeighbors(n_neighbors=len(all_users), algorithm='auto', metric='euclidean')
        knn.fit(X_scaled)

        # 5. Find Neighbors for "me" (index 0)
        distances, indices = knn.kneighbors([X_scaled[0]])

        # 6. Analyze Results
        results = []
        for i in range(1, len(distances[0])): # Skip self
            idx = indices[0][i]
            dist = distances[0][i]
            user_obj = df.iloc[idx]
            results.append({
                "username": user_obj.get('username'),
                "distance": round(dist, 4),
                "rank": int(user_obj['rank']),
                "style": int(user_obj['style_score'])
            })

        return jsonify({
            "test_scenario": "Target: Rank 1000 (Casual). Candidates: Perfect(1050/Cas), Gap(3000/Cas), Clash(1000/Spam)",
            "ai_ranking": results,
            "success_check": results[0]['username'] == 'Perfect Match' # Did AI pick the right one?
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
if __name__ == '__main__':
    app.run(debug=True, port=5000)