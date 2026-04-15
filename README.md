# Pregnancy Safety Checker 🤰

A web application that helps pregnant women check if foods or medications are safe to consume during pregnancy, powered by Shroud AI (confidential inference).

## Features

- **Instant Safety Checks**: Enter any food or medication name to get detailed safety information
- **AI-Powered Analysis**: Uses Shroud AI's confidential inference for accurate information
- **Safety Categorization**: Clear safety levels (Safe, Caution, Avoid, Consult Provider)
- **Detailed Information**: Get explanations, recommendations, and alternatives
- **Modern UI**: Clean, responsive interface that works on all devices
- **Example Queries**: Quick access to common searches

## Setup Instructions

### 1. Get Shroud API Key

1. Visit [dev.shroud.us](https://dev.shroud.us)
2. Sign in via Telegram or the dashboard
3. Navigate to Settings → API Keys
4. Generate a new API key

### 2. Install Dependencies

```bash
npm install
```

### 2.1 Run Tests

```bash
npm test
```

### 3. Run the Application

```bash
npm start
```

The app will be available at `http://localhost:3000`

### 4. Configure API Key

1. Open the application in your browser
2. Expand the "API Key Settings" section at the bottom
3. Enter your Shroud API key
4. Click "Save API Key"

## Usage

1. **Enter a Query**: Type any food or medication name (e.g., "coffee", "sushi", "tylenol")
2. **Click Check Safety**: Press the button or hit Enter
3. **View Results**: Get detailed safety information including:
   - Safety level classification
   - Detailed explanation
   - Key considerations
   - Recommendations
   - Safer alternatives (if applicable)

## Example Queries

- **Foods**: coffee, sushi, soft cheese, deli meat, raw eggs
- **Medications**: tylenol, ibuprofen, aspirin, benadryl
- **Beverages**: green tea, kombucha, energy drinks
- **Supplements**: vitamin A, fish oil, probiotics

## Important Disclaimer

⚠️ **Medical Disclaimer**: This application provides general information only and should NOT replace professional medical advice. Always consult with your healthcare provider before making any decisions about food or medication during pregnancy.

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **AI Service**: Shroud AI (OpenAI-compatible confidential inference)
- **Styling**: Custom CSS with responsive design

## File Structure

```
safebut/
├── index.html      # Main HTML structure
├── styles.css      # Styling
├── app.js          # Frontend JavaScript logic
├── server.js       # Express server
├── package.json    # Node.js dependencies
└── README.md       # Documentation
```

## Running Without Node.js

If you don't want to use Node.js, you can also open `index.html` directly in your browser. However, you'll need to:
1. Ensure your Shroud API key supports CORS from local file origins
2. Or use a local web server like Python's SimpleHTTPServer

```bash
# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

## Troubleshooting

- **API Key Issues**: Make sure your Shroud API key is valid and has sufficient credits
- **No Results**: Check browser console for errors, ensure API key is saved
- **CORS Errors**: Use the Node.js server method instead of opening the file directly

## GitHub Workflow

- Branch/PR process: `docs/GITHUB_WORKFLOW.md`
- Rollback runbook: `docs/ROLLBACK.md`
- Automated policy checks live in `.github/workflows`

## License

MIT