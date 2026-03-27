import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { upload_db } from './upload.js';
import { query } from './vectorsearch.js';
import { translateText } from './translate.js';
import { runAgent } from './mcpsearch.js';

declare module 'express-session' {
  interface SessionData {
    loggedIn?: boolean;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key', // Change this in production
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to check if user is logged in
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes
app.get('/', (req, res) => {
  if (req.session.loggedIn) {
    res.render('home', { currentPage: 'home' });
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Simple authentication - in production, use proper auth
  if (username === 'a' && password === 'p') {
    req.session.loggedIn = true;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/upload', requireAuth, (req, res) => {
  res.render('upload', { message: null, currentPage: 'upload' });
});

app.post('/upload', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === '') {
    return res.render('upload', { message: 'Please provide text to upload.', currentPage: 'upload' });
  }
  try {
    // Split text into documents by double newlines or treat as one
    const docs = text.split('\n\n').filter((doc: string) => doc.trim() !== '');
    await upload_db(docs);
    res.render('upload', { message: `${docs.length} document(s) uploaded successfully!`, currentPage: 'upload' });
  } catch (error) {
    console.error(error);
    res.render('upload', { message: 'Error uploading text.', currentPage: 'upload' });
  }
});

app.get('/chat', requireAuth, (req, res) => {
  res.render('chat', { messages: [], currentPage: 'chat' });
});

app.post('/chat', requireAuth, async (req, res) => {
  const { message } = req.body;
  try {
    const response = await query(message);

    // Check if this is an AJAX request
    const isAjax = req.headers.accept && req.headers.accept.includes('application/json');

    if (isAjax) {
      // Return JSON for AJAX requests
      res.json({ success: true, aiMessage: response.answer });
    } else {
      // Return HTML for regular form submissions
      const messages = [{ user: message, ai: response.answer }];
      res.render('chat', { messages, currentPage: 'chat' });
    }
  } catch (error) {
    console.error('Chat error:', error);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ success: false, aiMessage: 'Error processing query.' });
    } else {
      res.render('chat', { messages: [{ user: message, ai: 'Error processing query.' }], currentPage: 'chat' });
    }
  }
});

app.get('/advanced-chat', requireAuth, (req, res) => {
  res.render('advanced-chat', { messages: [], currentPage: 'advanced-chat' });
});

app.post('/advanced-chat', requireAuth, async (req, res) => {
  const { message } = req.body;
  try {
    // Use the advanced runAgent function for advanced chat
    const response = await runAgent(message);

    // Check if this is an AJAX request
    const isAjax = req.headers.accept && req.headers.accept.includes('application/json');

    if (isAjax) {
      // Return JSON for AJAX requests
      res.json({ success: true, aiMessage: response });
    } else {
      // Return HTML for regular form submissions
      const messages = [{ user: message, ai: response }];
      res.render('advanced-chat', { messages, currentPage: 'advanced-chat' });
    }
  } catch (error) {
    console.error('Advanced chat error:', error);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ success: false, aiMessage: 'Error processing query.' });
    } else {
      res.render('advanced-chat', { messages: [{ user: message, ai: 'Error processing query.' }], currentPage: 'advanced-chat' });
    }
  }
});

app.get('/translate', requireAuth, (req, res) => {
  res.render('translate', { translationResult: null, translatedText: null, currentPage: 'translate' });
});

app.post('/translate', requireAuth, async (req, res) => {
  const { sourceText, sourceLanguage, targetLanguage } = req.body;
  
  try {
    if (!sourceText || sourceText.trim() === '') {
      return res.status(400).json({ success: false, error: 'Please provide text to translate.' });
    }

    if (sourceLanguage === targetLanguage) {
      return res.status(400).json({ success: false, error: 'Source and target languages must be different.' });
    }

    const translatedText = await translateText(sourceText, sourceLanguage, targetLanguage);

    // Check if this is an AJAX request
    const isAjax = req.headers.accept && req.headers.accept.includes('application/json');

    if (isAjax) {
      // Return JSON for AJAX requests
      res.json({ success: true, translatedText: translatedText });
    } else {
      // Return HTML for regular form submissions
      res.render('translate', { translationResult: true, translatedText: translatedText, currentPage: 'translate' });
    }
  } catch (error) {
    console.error('Translation error:', error);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ success: false, error: 'Error processing translation.' });
    } else {
      res.render('translate', { translationResult: false, translatedText: null, currentPage: 'translate' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});