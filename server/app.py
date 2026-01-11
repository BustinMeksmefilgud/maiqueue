from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import datetime

app = Flask(__name__)
CORS(app)

# 1. Initialize Firebase Admin
# Check if app is already initialized to avoid errors during reloads
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

@app.route('/')
def hello():
    return "MaiQueue Backend is Running!"

@app.route('/api/test-firebase', methods=['GET'])
def test_firebase():
    try:
        # 1. Write data to the 'test_connection' collection
        # We add a timestamp so you know it's new
        doc_ref = db.collection('test_connection').add({
            'message': 'Hello from Python Backend!',
            'timestamp': datetime.datetime.now(),
            'sender': 'Flask Server'
        })
        
        return jsonify({
            "status": "success", 
            "message": "Successfully wrote to Firestore!",
            "doc_id": doc_ref[1].id
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Example: AI Trigger Endpoint
@app.route('/predict-wait', methods=['POST'])
def predict_wait():
    # Here is where we will put the Regression AI logic later
    return jsonify({"prediction": 15})

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "message": "Back shot successfully!",
        "active_users": 5,
        "wait_time": 12
    })

if __name__ == '__main__':
    app.run(debug=True)