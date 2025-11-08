from flask import Flask, request, jsonify
import json, time

app = Flask(__name__)
ledger_file = "ledger.json"

# Load existing ledger if it exists
try:
    with open(ledger_file, "r") as f:
        ledger = json.load(f)
except:
    ledger = []

@app.route('/addData', methods=['POST'])
def add_data():
    data = request.get_json()

    entry = {
        "temperature": data["temperature"],
        "humidity": data["humidity"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    ledger.append(entry)

    # Save to JSON file (acts as blockchain ledger)
    with open(ledger_file, "w") as f:
        json.dump(ledger, f, indent=4)

    print(f"✅ New entry added: {entry}")
    return jsonify({"status": "recorded", "total_entries": len(ledger)})

if __name__ == '__main__':
    # Run server on your local IP (all devices on same Wi-Fi can access)
    app.run(host='0.0.0.0', port=5000)
