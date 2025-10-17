

const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const mongoose = require("mongoose");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "supersecret"; // use env var in real projects
const usedTokens = new Set();
const { v4: uuidv4 } = require("uuid");
// Owner email (has full access)
const OWNER_EMAIL = "shreyagaikwad107@gmail.com";
const tokenStore = {};


// This will be your deployed URL - UPDATE THIS AFTER DEPLOYMENT
const DEPLOYED_URL = "https://pdfsecurity.onrender.com"; // Your deployed URL

// Store authorized recipients with their specific tokens and permissions
const AUTHORIZED_RECIPIENTS = new Map(); // email -> {token, canEdit, pdfData}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://shreyagaikwad107_db_user:shreya09@cluster0.qwauncw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("✅ Connected to MongoDB Atlas");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

const tokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: "12h" } // auto-delete
});

const TokenModel = mongoose.model("Token", tokenSchema);

// Generate a secure download link for recipient
// Generate a secure one-time use link for a recipient
app.get("/generate-link", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send({ success: false, error: "Email is required" });

  try {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ email, jti }, SECRET_KEY, { expiresIn: "12h" });

    // ❌ BUG: This line has NO await - token not saved to MongoDB!
    await TokenModel.create({ jti, email, used: false });

    AUTHORIZED_RECIPIENTS.set(email, {
      token,
      canEdit: true,
      pdfData: null
    });

    const link = `${DEPLOYED_URL}/view?token=${token}`;
    console.log(`Generated link for ${email}: ${link}`);

    res.send({ success: true, secureLink: link });

  } catch (error) {
    console.error("Error generating secure link:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});
// Route to send email to any recipient
app.get("/send-email/:email", async (req, res) => {
  const email = req.params.email;
  
  try {
    // Generate the secure link via centralized route
    const response = await fetch(`${DEPLOYED_URL}/generate-link?email=${encodeURIComponent(email)}`);
    const data = await response.json();

    if (!data.success) return res.status(500).send({ success: false, error: data.error });

    const secureLink = data.secureLink;

    // Send email
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "shreyagaikwad107@gmail.com", pass: "ukrb lzop ycqs epvi" },
    });

    let info = await transporter.sendMail({
      from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
      to: email,
      subject: "Your Secured PDF Link - View and Edit",
      text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}`,
    });

    res.send({ success: true, message: `Email sent to ${email}`, messageId: info.messageId, secureLink });

  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});


// Route to check if a recipient is authorized
app.get("/check-recipient", (req, res) => {
  const { email } = req.query;
 
  if (!email) {
    return res.status(400).send({ authorized: false, error: "Email required" });
  }
 
  // Check if user is owner
  if (email === OWNER_EMAIL) {
    return res.send({ authorized: true, role: "owner" });
  }
 
  // Check if user is authorized recipient
  if (AUTHORIZED_RECIPIENTS.has(email)) {
    const recipient = AUTHORIZED_RECIPIENTS.get(email);
    if (recipient.canEdit) {
      return res.send({ authorized: true, role: "recipient" });
    }
  }
 
  // User not authorized
  res.send({ authorized: false, role: "unauthorized" });
});



// Web interface for sending emails or SMS
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Send Secure PDF Link</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            .form-section { margin: 20px 0; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .form-section h3 { margin-top: 0; color: #333; }
            input[type="email"], input[type="tel"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background: #0056b3; }
            .status { margin-top: 20px; padding: 10px; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .quick-actions { margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>📧 Send Secure PDF Link</h2>
            
            <!-- Email Section -->
            <div class="form-section">
                <h3>📧 Send via Email</h3>
                <p>Enter an email address to send the secure PDF link (recipients can view and edit in Chrome):</p>
                <form id="emailForm">
                    <input type="email" id="email" placeholder="Enter email address" required>
                    <button type="submit">Send Email</button>
                </form>
            </div>
            
            <!-- Phone Number Section -->
            <div class="form-section">
                <h3>📱 Send via Phone Number</h3>
                <p>Enter a phone number to send the secure PDF link via SMS:</p>
                <form id="phoneForm">
                    <input type="tel" id="phone" placeholder="Enter phone number (e.g., +1234567890)" required>
                    <button type="submit">Send SMS</button>
                </form>
            </div>
            
            <div id="status"></div>
           
            <hr style="margin: 30px 0;">
            <div class="quick-actions">
                <h3>Quick Actions:</h3>
                <button onclick="sendToOwner()">Send to Owner</button>
                <button onclick="window.location.href='/'">View PDF Access Page</button>
            </div>
        </div>
       
        <script>
            // Email Form Handler
            document.getElementById('emailForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const statusDiv = document.getElementById('status');
               
                statusDiv.innerHTML = '<div class="status">Sending email...</div>';
               
                try {
                    const response = await fetch('/send-email/' + encodeURIComponent(email));
                    const result = await response.json();
                   
                    if (result.success) {
                        statusDiv.innerHTML = '<div class="status success">✅ Email sent successfully to ' + email + '</div>';
                        document.getElementById('email').value = '';
                    } else {
                        statusDiv.innerHTML = '<div class="status error">❌ Error: ' + result.error + '</div>';
                    }
                } catch (error) {
                    statusDiv.innerHTML = '<div class="status error">❌ Network error: ' + error.message + '</div>';
                }
            });
            
            // Phone Form Handler
            document.getElementById('phoneForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const phone = document.getElementById('phone').value;
                const statusDiv = document.getElementById('status');
               
                statusDiv.innerHTML = '<div class="status">Sending SMS...</div>';
               
                try {
                    const response = await fetch('/send-sms/' + encodeURIComponent(phone), {
                        method: 'POST'
                    });
                    const result = await response.json();
                   
                    if (result.success) {
                        statusDiv.innerHTML = '<div class="status success">✅ SMS sent successfully to ' + phone + '</div>';
                        document.getElementById('phone').value = '';
                    } else {
                        statusDiv.innerHTML = '<div class="status error">❌ Error: ' + result.error + '</div>';
                    }
                } catch (error) {
                    statusDiv.innerHTML = '<div class="status error">❌ Network error: ' + error.message + '</div>';
                }
            });
           
            async function sendToOwner() {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = '<div class="status">Sending email to owner...</div>';
                try {
                    const saveOk = await saveEditedPDF();
                    if (!saveOk) {
                        statusDiv.innerHTML = '<div class="status error">❌ Could not save the edited PDF.</div>';
                        return;
                    }
                    // Small delay for save to finalize on server
                    await new Promise(r => setTimeout(r, 800));
                    const formData = new FormData();
                    formData.append('token', AUTH_TOKEN);
                    const response = await fetch('/send-back', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.success) {
                        statusDiv.innerHTML = '<div class="status success">✅ Edited PDF submitted to owner.</div>';
                    } else {
                        statusDiv.innerHTML = '<div class="status error">❌ ' + (result.error || 'Failed to submit PDF') + '</div>';
                    }
                } catch (error) {
                    statusDiv.innerHTML = '<div class="status error">❌ ' + error.message + '</div>';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// View route (shows Google sign-in for recipients, PDF viewer for authenticated users)
app.get("/view", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Token required");

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenDoc = await TokenModel.findOne({ jti: decoded.jti });

    if (!tokenDoc) return res.status(403).send("Access Denied: Invalid token");

    if (tokenDoc.used) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Access Denied</title></head>
        <body>
          <h1>Access Denied</h1>
          <p>This link has already been used.</p>
        </body>
        </html>
      `);
    }

    // ✅ Mark token as used immediately
    tokenDoc.used = true;
    await tokenDoc.save();

    // Redirect to PDF viewer or main page
     return res.redirect(`https://eyecamp.onrender.com/?token=${encodeURIComponent(token)}`);


  } catch (err) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Access Denied</title></head>
      <body>
        <h1>Access Denied</h1>
        <p>Invalid or expired link.</p>
      </body>
      </html>
    `);
  }
});

// Route to serve PDF content (embedded in browser - STRICTLY prevent downloads for recipients)
app.get("/pdf-content", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send("Token required");

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const { jti } = decoded;

    // Check token validity in MongoDB
    const tokenDoc = await TokenModel.findOne({ jti });

    if (!tokenDoc) {
      return res.status(401).send("Invalid token");
    }
    if (tokenDoc.used) {
      return res.status(403).send("This link has already been used.");
    }

    // Mark token as used
    tokenDoc.used = true;
    await tokenDoc.save();

    // Serve PDF
    const pdfPath = path.join(__dirname, "resume.pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=secure.pdf");
    fs.createReadStream(pdfPath).pipe(res);

  } catch (err) {
    res.status(401).send("Invalid or expired token");
  }
});




// // Route for direct access - shows Google account picker
// app.get("/", (req, res) => {
//   const { token } = req.query;
  
//   if (token) {
//     try {
//       const decoded = jwt.verify(token, SECRET_KEY);
      
//       // If it's the owner or a specifically authorized recipient with matching token, redirect to view
//       if (decoded.email === OWNER_EMAIL || 
//           (AUTHORIZED_RECIPIENTS.has(decoded.email) && 
//            AUTHORIZED_RECIPIENTS.get(decoded.email).token === token &&
//            AUTHORIZED_RECIPIENTS.get(decoded.email).canEdit)) {
//         return res.redirect(`/view?token=${token}`);
//       }
//     } catch (err) {p
//       // Token invalid or expired, show account picker
//     }
//   }
  
//   // Show Google account picker for unauthorized users
//   res.send(`
//     <!DOCTYPE html>
//     <html>
//     <head>
//         <title>Secure PDF Access</title>
//         <meta name="google-signin-client_id" content="796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com">
//         <script src="https://accounts.google.com/gsi/client" async defer onload="updateDebugInfo('Google script loaded')" onerror="updateDebugInfo('Google script failed to load')"></script>
//         <style>
//             body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
//             .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
//             .logo { font-size: 48px; margin-bottom: 20px; }
//             h1 { color: #333; margin-bottom: 10px; }
//             .subtitle { color: #666; margin-bottom: 30px; font-size: 18px; }
//             .google-signin { margin: 30px 0; }
//             .security-info { background: #e7f3ff; padding: 20px; border-radius: 10px; margin: 30px 0; border: 1px solid #b3d9ff; text-align: left; }
//             .owner-actions { margin-top: 30px; }
//             .owner-btn { background: #28a745; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 10px; }
//             .owner-btn:hover { background: #1e7e34; }
//             .status { margin: 20px 0; padding: 15px; border-radius: 8px; font-weight: bold; }
//             .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
//             .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
//         </style>
//     </head>
//     <body>
//         <div class="container">
//             <div class="logo">🔒</div>
//             <h1>Secure PDF Access</h1>
//             <p class="subtitle">Select your Google account to access the secure PDF</p>
            
//             <div class="google-signin">
//                 <div id="google-signin-button">
//                     <button id="fallback-button" onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; display: block;">
//                         🔐 Sign in with Google
//                     </button>
//                 </div>
//             </div>
            
//             <div class="security-info">
//                 <strong>🔐 How it works:</strong>
//                 <ul style="margin: 15px 0; padding-left: 20px;">
//                     <li>Click "Sign in with Google" above</li>
//                     <li>Select your Google account</li>
//                     <li>If you're an authorized recipient, PDF opens automatically</li>
//                     <li>If not authorized, access is denied</li>
//                     <li>No email typing required - just account selection</li>
//                 </ul>
//             </div>
            
//             <div class="owner-actions">
//                 <button class="owner-btn" onclick="window.open('/send', '_blank')">📧 Send Secure Links to Recipients</button>
//                 <button class="owner-btn" onclick="window.open('/send', '_blank')">🌐 Manage Recipients</button>
//             </div>
            
//             <div id="status"></div>
//             <div id="debug-info" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666;">
//                 <strong>Debug Info:</strong>
//                 <div id="debug-content">Loading...</div>
//             </div>
//         </div>
        
//         <script>
//             // Check if Google Identity Services loaded properly
//             window.addEventListener('load', function() {
//                 updateDebugInfo('Page loaded, checking Google Identity Services...');
                
//                 // Wait a bit for Google script to load
//                 setTimeout(function() {
//                     if (typeof google !== 'undefined' && google.accounts) {
//                         updateDebugInfo('✅ Google Identity Services loaded successfully');
//                         console.log('Google Identity Services loaded successfully');
                        
//                         // Initialize Google Sign-In
//                         google.accounts.id.initialize({
//                             client_id: '796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com',
//                             callback: handleCredentialResponse
//                         });
                        
//                         // Render the button
//                         google.accounts.id.renderButton(
//                             document.getElementById('google-signin-button'),
//                             { 
//                                 theme: 'outline', 
//                                 size: 'large',
//                                 text: 'signin_with',
//                                 shape: 'rectangular'
//                             }
//                         );
                        
//                         // Hide the fallback button
//                         const fallbackButton = document.getElementById('fallback-button');
//                         if (fallbackButton) {
//                             fallbackButton.style.display = 'none';
//                         }
                        
//                         updateDebugInfo('✅ Google Sign-In button rendered');
//                     } else {
//                         updateDebugInfo('❌ Google Identity Services failed to load. Showing manual sign-in.');
//                         console.error('Google Identity Services failed to load');
//                         document.getElementById('google-signin-button').innerHTML = 
//                             '<button onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">Sign in with Google (Manual)</button>';
//                     }
//                 }, 2000); // Wait 2 seconds for Google script to load
//             });

//             function updateDebugInfo(message) {
//                 const debugContent = document.getElementById('debug-content');
//                 if (debugContent) {
//                     debugContent.innerHTML += '<br>' + new Date().toLocaleTimeString() + ': ' + message;
//                 }
//             }

//             function handleCredentialResponse(response) {
//                 // Decode the JWT token from Google
//                 const payload = JSON.parse(atob(response.credential.split('.')[1]));
//                 const userEmail = payload.email;
                
//                 console.log('User selected:', userEmail);
                
//                 // Check if user is authorized
//                 checkAccess(userEmail);
//             }

//             function showManualSignin() {
//                 const email = prompt('Please enter your email address:');
//                 if (email) {
//                     checkAccess(email);
//                 }
//             }
            
//             function checkAccess(email) {
//                 const statusDiv = document.getElementById('status');
//                 statusDiv.innerHTML = '<div class="status">Checking access...</div>';
                
//                 // Check if user is owner or authorized recipient
//                 if (email === 'shreyagaikwad107@gmail.com') {
//                     // Owner access
//                     statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
//                     generateAndRedirect(email);
//                 } else {
//                     // Check if user is authorized recipient
//                     fetch('/check-recipient?email=' + encodeURIComponent(email))
//                         .then(response => response.json())
//                         .then(data => {
//                             if (data.authorized) {
//                                 statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
//                                 generateAndRedirect(email);
//                             } else {
//                                 statusDiv.innerHTML = '<div class="status error">❌ Access denied. You are not authorized to view this PDF.</div>';
//                             }
//                         })
//                         .catch(error => {
//                             statusDiv.innerHTML = '<div class="status error">❌ Error checking access. Please try again.</div>';
//                         });
//                 }
//             }
            
//             function generateAndRedirect(email) {
//                 fetch('/generate-link?email=' + encodeURIComponent(email))
//                     .then(response => response.json())
//                     .then(data => {
//                         setTimeout(() => {
//                             window.location.href = data.secureLink;
//                         }, 1500);
//                     })
//                     .catch(error => {
//                         console.error('Error generating link:', error);
//                     });
//             }
//         </script>
//     </body>
//     </html>
//   `);
// });

// ----------------- EMAIL SENDER -----------------
async function sendSecureLink() {
    // Create token
  const token = jwt.sign({ email: OWNER_EMAIL }, SECRET_KEY, {
    expiresIn: "12h",
  });
    
    const secureLink = `${DEPLOYED_URL}/view?token=${token}`;

    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
      user: "shreyagaikwad107@gmail.com",
      pass: "ukrb lzop ycqs epvi",
      },
    });

    let info = await transporter.sendMail({
    from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
      to: OWNER_EMAIL,
      subject: "Your Secured PDF Link - View and Edit",
    text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF directly in your browser, then send it back to the owner.`,
    });

    console.log("Email sent:", info.messageId);
}

// ----------------- START SERVER -----------------
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Secure PDF Email System Started!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Deployed URL: ${DEPLOYED_URL}`);
  
  console.log(`\n📧 Quick Actions:`);
  console.log(`• Send email to any recipient: ${DEPLOYED_URL}/send-email/EMAIL_ADDRESS`);
  console.log(`• Web interface for sending emails: ${DEPLOYED_URL}/send`);
  console.log(`• PDF access page: ${DEPLOYED_URL}/`);
  
  
  // Send the secure link automatically when server starts
  await sendSecureLink();
});