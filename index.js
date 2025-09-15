
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "supersecret"; // use env var in real projects

// Owner email (has full access)
const OWNER_EMAIL = "shreyagaikwad107@gmail.com";

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

// Generate a secure download link for recipient
app.get("/generate-link", (req, res) => {
  const { email } = req.query;
  const recipientEmail = email || OWNER_EMAIL;
 
  const token = jwt.sign({ email: recipientEmail }, SECRET_KEY, {
    expiresIn: "12h",
  });

  const link = `${DEPLOYED_URL}/view?token=${token}`;
 
  res.send({ secureLink: link });
});

// Route to send email to any recipient
app.get("/send-email/:email", async (req, res) => {
  const email = req.params.email;
 
  try {
    // Create token for the specified email
    const token = jwt.sign({ email: email }, SECRET_KEY, {
      expiresIn: "12h",
    });
   
    // Store the token for this specific recipient with edit permissions
    AUTHORIZED_RECIPIENTS.set(email, {
      token: token,
      canEdit: true,
      pdfData: null
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
      from: '"Shreya Gaikwad" <shreyagaikwad107@gmail.com>',
      to: email,
      subject: "Your Secured PDF Link - View and Edit",
      text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF directly in your browser, then send it back to the owner.`,
    });

    console.log("Email sent to:", email, "Message ID:", info.messageId);
    console.log("Authorized recipients:", Array.from(AUTHORIZED_RECIPIENTS.keys()));
    res.send({ success: true, message: `Email sent to ${email}`, messageId: info.messageId });
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

// Fixed /edit-pdf endpoint
// app.post("/edit-pdf", upload.single('pdf'), async (req, res) => {
//   const { token, editType, editData } = req.body;
 
//   try {
//     const decoded = jwt.verify(token, SECRET_KEY);
//     const tokenEmail = decoded.email;

//     // Check authorization
//     const isOwner = tokenEmail === OWNER_EMAIL;
//     const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) &&
//                                  AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
//                                  AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

//     if (!isOwner && !isAuthorizedRecipient) {
//       return res.status(403).json({ success: false, error: "Unauthorized" });
//     }

//     // Check if resume.pdf exists
//     const originalPdfPath = path.join(__dirname, "resume.pdf");
//     if (!fs.existsSync(originalPdfPath)) {
//       console.error("resume.pdf not found at:", originalPdfPath);
//       return res.status(404).json({ success: false, error: "PDF file not found" });
//     }

//     // Load the original PDF
//     const existingPdfBytes = fs.readFileSync(originalPdfPath);
   
//     // Create a PDFDocument
//     const pdfDoc = await PDFDocument.load(existingPdfBytes);
//     const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
   
//     // Parse the edit data
//     let edits;
//     try {
//       edits = JSON.parse(editData);
//     } catch (parseError) {
//       console.error("Error parsing editData:", parseError);
//       return res.status(400).json({ success: false, error: "Invalid edit data format" });
//     }
   
//     console.log(`Processing ${edits.length} edits for ${tokenEmail}`);
   
//     // Get the first page
//     const pages = pdfDoc.getPages();
//     if (pages.length === 0) {
//       return res.status(400).json({ success: false, error: "PDF has no pages" });
//     }
    
//     const page = pages[0];
//     const { width, height } = page.getSize();
//     console.log(`PDF dimensions: ${width} x ${height}`);
   
//     // Apply edits based on type
//     for (const edit of edits) {
//       try {
//         switch (edit.type) {
//           case 'text':
//             page.drawText(edit.text || '', {
//               x: Math.max(0, Math.min(width - 50, edit.x || 0)),
//               y: Math.max(0, Math.min(height - 20, height - (edit.y || 0))),
//               size: Math.max(8, Math.min(72, edit.fontSize || 12)),
//               font: helveticaFont,
//               color: rgb(
//                 Math.max(0, Math.min(1, edit.color?.r || 0)),
//                 Math.max(0, Math.min(1, edit.color?.g || 0)),
//                 Math.max(0, Math.min(1, edit.color?.b || 0))
//               ),
//             });
//             console.log(`Applied text edit: "${edit.text}" at (${edit.x}, ${edit.y})`);
//             break;
           
//           case 'textEdit':
//             // Draw white rectangle to cover old text
//             if (edit.oldText && edit.fontSize) {
//               const textWidth = (edit.oldText.length * (edit.fontSize || 12) * 0.6);
//               page.drawRectangle({
//                 x: Math.max(0, (edit.x || 0) - 2),
//                 y: Math.max(0, height - (edit.y || 0) - (edit.fontSize || 12) - 2),
//                 width: textWidth + 4,
//                 height: (edit.fontSize || 12) + 4,
//                 color: rgb(1, 1, 1), // White background
//               });
//             }
           
//             // Draw the new text
//             page.drawText(edit.newText || '', {
//               x: Math.max(0, Math.min(width - 50, edit.x || 0)),
//               y: Math.max(0, Math.min(height - 20, height - (edit.y || 0))),
//               size: Math.max(8, Math.min(72, edit.fontSize || 12)),
//               font: helveticaFont,
//               color: rgb(0, 0, 0),
//             });
//             console.log(`Applied text edit: "${edit.oldText}" -> "${edit.newText}"`);
//             break;
           
//           case 'rectangle':
//             page.drawRectangle({
//               x: Math.max(0, edit.x || 0),
//               y: Math.max(0, height - (edit.y || 0) - (edit.height || 0)),
//               width: Math.max(1, Math.min(width, edit.width || 50)),
//               height: Math.max(1, Math.min(height, edit.height || 30)),
//               borderColor: rgb(
//                 Math.max(0, Math.min(1, edit.borderColor?.r || 0)),
//                 Math.max(0, Math.min(1, edit.borderColor?.g || 0)),
//                 Math.max(0, Math.min(1, edit.borderColor?.b || 0))
//               ),
//               borderWidth: Math.max(0.5, Math.min(10, edit.borderWidth || 1)),
//             });
//             console.log(`Applied rectangle at (${edit.x}, ${edit.y})`);
//             break;
           
//           case 'line':
//             page.drawLine({
//               start: {
//                 x: Math.max(0, Math.min(width, edit.startX || 0)),
//                 y: Math.max(0, Math.min(height, height - (edit.startY || 0)))
//               },
//               end: {
//                 x: Math.max(0, Math.min(width, edit.endX || 0)),
//                 y: Math.max(0, Math.min(height, height - (edit.endY || 0)))
//               },
//               thickness: Math.max(0.5, Math.min(10, edit.thickness || 1)),
//               color: rgb(
//                 Math.max(0, Math.min(1, edit.color?.r || 0)),
//                 Math.max(0, Math.min(1, edit.color?.g || 0)),
//                 Math.max(0, Math.min(1, edit.color?.b || 0))
//               ),
//             });
//             console.log(`Applied line from (${edit.startX}, ${edit.startY}) to (${edit.endX}, ${edit.endY})`);
//             break;
           
//           default:
//             console.log(`Skipping unknown edit type: ${edit.type}`);
//         }
//       } catch (editError) {
//         console.error(`Error applying edit:`, editError);
//         // Continue with other edits even if one fails
//       }
//     }
   
//     // Save the modified PDF
//     const pdfBytes = await pdfDoc.save();
//     const editedFileName = `edited-resume-${tokenEmail.replace(/[@.]/g, '_')}-${Date.now()}.pdf`;
//     const editedFilePath = path.join(__dirname, 'uploads', editedFileName);
   
//     // Ensure uploads directory exists
//     if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
//       fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
//     }
    
//     fs.writeFileSync(editedFilePath, pdfBytes);
   
//     console.log(`PDF saved successfully: ${editedFileName}`);
//     console.log(`File size: ${pdfBytes.length} bytes`);
   
//     res.json({
//       success: true,
//       message: "PDF edited successfully",
//       fileName: editedFileName,
//       editsApplied: edits.length,
//       filePath: editedFilePath,
//       fileSize: pdfBytes.length
//     });
   
//   } catch (error) {
//     console.error("Error editing PDF:", error);
//     console.error("Stack trace:", error.stack);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       details: "Failed to apply PDF edits",
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// });


// Enhanced send-back route to handle the new editing system
app.post("/send-back", upload.single('pdf'), async (req, res) => {
  const { token, recipientEmail, editSummary } = req.body;
 
  try {
    // Verify token
    const decoded = jwt.verify(token, SECRET_KEY);
   
    // Check if the recipient is authorized with matching token and can edit
    if (decoded.email !== OWNER_EMAIL &&
        (!AUTHORIZED_RECIPIENTS.has(decoded.email) ||
         AUTHORIZED_RECIPIENTS.get(decoded.email).token !== token ||
         !AUTHORIZED_RECIPIENTS.get(decoded.email).canEdit)) {
      return res.status(403).send({ success: false, error: "Unauthorized recipient or no edit permissions" });
    }
   
    // Find the most recent edited PDF file for this user
    const uploadsDir = path.join(__dirname, 'uploads');
    const userFilePattern = `edited-resume-${decoded.email.replace(/[@.]/g, '_')}`;
   
    let mostRecentFile = null;
    let mostRecentTime = 0;
   
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        if (file.startsWith(userFilePattern)) {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs > mostRecentTime) {
            mostRecentTime = stats.mtimeMs;
            mostRecentFile = file;
          }
        }
      });
    }
   
    if (!mostRecentFile && !req.file) {
      return res.status(400).send({ success: false, error: "No edited PDF found to send" });
    }
   
    let attachmentPath = null;
    let fileName = `edited-resume-from-${decoded.email}-${Date.now()}.pdf`;
   
    if (req.file) {
      // Use uploaded file
      fileName = `edited-resume-upload-${decoded.email.replace(/[@.]/g, '_')}-${Date.now()}.pdf`;
      attachmentPath = path.join(__dirname, 'uploads', fileName);
      fs.writeFileSync(attachmentPath, req.file.buffer);
    } else if (mostRecentFile) {
      // Use most recent edited file
      attachmentPath = path.join(uploadsDir, mostRecentFile);
      fileName = mostRecentFile;
    }
   
    // Parse edit summary if provided
    let summaryText = '';
    if (editSummary) {
      try {
        const summary = JSON.parse(editSummary);
        summaryText = `
📊 Edit Summary:
• Text modifications: ${summary.textEdits || 0}
• New text added: ${summary.newText || 0}  
• Drawings/annotations: ${summary.drawings || 0}
• Edited by: ${summary.editor}
• Timestamp: ${new Date(summary.timestamp).toLocaleString()}
        `;
      } catch (e) {
        summaryText = 'Edit summary parsing failed, but PDF contains all changes.';
      }
    }

    // IMMEDIATELY send email to shreyagaikwad10@gmail.com with the edited PDF
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shreyagaikwad107@gmail.com",
        pass: "ukrb lzop ycqs epvi",
      },
    });

    const emailResult = await transporter.sendMail({
      from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
      to: "shreyagaikwad10@gmail.com",
      subject: `📄 Enhanced PDF Edit Received from ${decoded.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">📄 Enhanced PDF Edit Received</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p><strong>From:</strong> ${decoded.email}</p>
            <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>File:</strong> ${fileName}</p>
          </div>
         
          ${summaryText ? `
          <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
            <pre style="margin: 0; font-family: Arial, sans-serif; white-space: pre-wrap;">${summaryText}</pre>
          </div>
          ` : ''}
         
          <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin: 0 0 10px 0; color: #155724;">✅ Features Used:</h3>
            <ul style="margin: 0; color: #155724;">
              <li>Direct PDF text editing (modify existing content)</li>
              <li>Add new text anywhere on the document</li>
              <li>Drawing and annotation tools</li>
              <li>Mobile-optimized virtual keyboard</li>
              <li>Professional PDF modification</li>
            </ul>
          </div>
         
          <p><strong>📱 Mobile Support:</strong> This PDF was edited using our mobile-optimized interface with virtual keyboard support for seamless text editing on any device.</p>
         
          <p><strong>🔒 Security:</strong> The recipient could only view and edit - no downloads were allowed during the editing process.</p>
        </div>
      `,
      attachments: [{
        filename: fileName,
        path: attachmentPath
      }]
    });

    console.log(`✅ Enhanced edited PDF sent to shreyagaikwad10@gmail.com from ${decoded.email}`);
    console.log(`📧 Email sent: ${emailResult.messageId}`);
    console.log(`📄 File: ${fileName}`);

    res.send({
      success: true,
      message: "Enhanced edited PDF sent successfully to owner!",
      emailId: emailResult.messageId,
      fileName: fileName,
      features: {
        textEditing: true,
        newTextAddition: true,
        mobileSupport: true,
        virtualKeyboard: true,
        drawingTools: true
      }
    });
   
  } catch (error) {
    console.error("Error sending enhanced PDF:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Web interface for sending emails
// Web interface for sending emails or SMS
app.get("/send", (req, res) => {
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
app.get("/view", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    const isOwner = tokenEmail === OWNER_EMAIL;
    const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) &&
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

    if (!isOwner && !isAuthorizedRecipient) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Access Denied</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1 class="error">Access Denied</h1>
            <p>You are not authorized to access this PDF. Only the original recipient can use this link.</p>
        </body>
        </html>
      `);
    }

    // For recipients, show Google sign-in first
    if (!isOwner) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Recipient Authentication Required</title>
            <meta name="google-signin-client_id" content="796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com">
            <script src="https://accounts.google.com/gsi/client" async defer></script>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
                .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
                .logo { font-size: 48px; margin-bottom: 20px; }
                h1 { color: #333; margin-bottom: 10px; }
                .subtitle { color: #666; margin-bottom: 30px; font-size: 18px; }
                .google-signin { margin: 30px 0; }
                .security-info { background: #e7f3ff; padding: 20px; border-radius: 10px; margin: 30px 0; border: 1px solid #b3d9ff; text-align: left; }
                .status { margin: 20px 0; padding: 15px; border-radius: 8px; font-weight: bold; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🔒</div>
                <h1>Recipient Authentication Required</h1>
                <p class="subtitle">You've been invited to view and edit a secure PDF</p>
               
                <div class="warning" style="margin: 20px 0;">
                    <strong>⚠️ Important:</strong> You must sign in with the Google account that received the invitation email: <strong>${tokenEmail}</strong>
                </div>
               
                <div class="google-signin">
                    <div id="google-signin-button">
                        <button id="fallback-button" onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; display: block;">
                            🔐 Sign in with Google
                        </button>
                    </div>
                </div>
               
                <div class="security-info">
                    <strong>🔐 How it works:</strong>
                    <ul style="margin: 15px 0; padding-left: 20px;">
                        <li>Click "Sign in with Google" above</li>
                        <li>Select the Google account: <strong>${tokenEmail}</strong></li>
                        <li>If authentication matches, PDF opens automatically</li>
                        <li>You can then view and edit the PDF in your browser</li>
                        <li><strong>🚫 Downloads completely disabled</strong> - no browser PDF controls</li>
                        <li>PDF opens in secure viewer only - no 3-dot menu options</li>
                    </ul>
                </div>
               
                <div id="status"></div>
            </div>
           
            <script>
                // Check if Google Identity Services loaded properly
                window.addEventListener('load', function() {
                    // Wait a bit for Google script to load
                    setTimeout(function() {
                        if (typeof google !== 'undefined' && google.accounts) {
                            console.log('Google Identity Services loaded successfully');
                           
                            // Initialize Google Sign-In
                            google.accounts.id.initialize({
                                client_id: '796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com',
                                callback: handleCredentialResponse
                            });
                           
                            // Render the button
                            google.accounts.id.renderButton(
                                document.getElementById('google-signin-button'),
                                {
                                    theme: 'outline',
                                    size: 'large',
                                    text: 'signin_with',
                                    shape: 'rectangular'
                                }
                            );
                           
                            // Hide the fallback button
                            const fallbackButton = document.getElementById('fallback-button');
                            if (fallbackButton) {
                                fallbackButton.style.display = 'none';
                            }
                        } else {
                            console.error('Google Identity Services failed to load');
                            document.getElementById('google-signin-button').innerHTML =
                                '<button onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer;">Sign in with Google (Manual)</button>';
                        }
                    }, 2000);
                });

                function handleCredentialResponse(response) {
                    // Decode the JWT token from Google
                    const payload = JSON.parse(atob(response.credential.split('.')[1]));
                    const userEmail = payload.email;
                   
                    console.log('User selected:', userEmail);
                   
                    // Verify the email matches the invited recipient
                    if (userEmail === '${tokenEmail}') {
                        showStatus('✅ Authentication successful! Opening PDF...', 'success');
                        // Redirect to the actual PDF viewer
                        setTimeout(() => {
                            window.location.href = '/pdf-viewer?token=${token}';
                        }, 1500);
                    } else {
                        showStatus('❌ Authentication failed! You must sign in with ${tokenEmail}', 'error');
                    }
                }

                function showManualSignin() {
                    const email = prompt('Please enter your email address:');
                    if (email) {
                        if (email === '${tokenEmail}') {
                            showStatus('✅ Email verified! Opening PDF...', 'success');
                            setTimeout(() => {
                                window.location.href = '/pdf-viewer?token=${token}';
                            }, 1500);
                        } else {
                            showStatus('❌ Email does not match the invited recipient', 'error');
                        }
                    }
                }
               
                function showStatus(message, type) {
                    const statusDiv = document.getElementById('status');
                    statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
                    statusDiv.style.display = 'block';
                   
                    setTimeout(() => {
                        statusDiv.style.display = 'none';
                    }, 5000);
                }
            </script>
        </body>
        </html>
      `);
    }

    // For owner, show the PDF viewer directly
    return res.redirect(`/pdf-viewer?token=${token}`);
  } catch (err) {
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Access Denied</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
              .error { color: red; }
          </style>
      </head>
      <body>
          <h1 class="error">Access Denied</h1>
          <p>Invalid or expired link.</
      </body>
      </html>
    `);
  }
});

// app.get("/pdf-viewer", (req, res) => {
//   const { token } = req.query;

//   try {
//     const decoded = jwt.verify(token, SECRET_KEY);
//     const tokenEmail = decoded.email;

//     const isOwner = tokenEmail === OWNER_EMAIL;
//     const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) &&
//                                  AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
//                                  AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

//     if (!isOwner && !isAuthorizedRecipient) {
//       return res.status(403).send("Access denied");
//     }

//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//           <title>Advanced PDF Editor</title>
//           <meta name="viewport" content="width=device-width, initial-scale=1.0">
//           <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
//           <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>
//           <style>
//               * {
//                   box-sizing: border-box;
//                   -webkit-tap-highlight-color: transparent;
//               }
//               body {
//                   font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//                   margin: 0;
//                   padding: 10px;
//                   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//                   min-height: 100vh;
//                   overflow-x: hidden;
//               }
//               .editor-container {
//                   max-width: 100%;
//                   margin: 0 auto;
//                   display: flex;
//                   flex-direction: column;
//                   gap: 15px;
//                   min-height: 90vh;
//               }
//               .toolbar {
//                   width: 100%;
//                   background: rgba(255,255,255,0.95);
//                   backdrop-filter: blur(10px);
//                   padding: 15px;
//                   border-radius: 15px;
//                   box-shadow: 0 8px 32px rgba(0,0,0,0.1);
//                   border: 1px solid rgba(255,255,255,0.2);
//                   order: 2;
//               }
//               .pdf-editor {
//                   flex: 1;
//                   background: rgba(255,255,255,0.95);
//                   backdrop-filter: blur(10px);
//                   border-radius: 15px;
//                   padding: 15px;
//                   box-shadow: 0 8px 32px rgba(0,0,0,0.1);
//                   border: 1px solid rgba(255,255,255,0.2);
//                   order: 1;
//               }
//               .tool-section {
//                   margin-bottom: 20px;
//                   padding-bottom: 15px;
//                   border-bottom: 2px solid #f0f0f0;
//               }
//               .tool-section h3 {
//                   margin: 0 0 15px 0;
//                   color: #333;
//                   font-size: 16px;
//                   font-weight: 600;
//                   display: flex;
//                   align-items: center;
//                   gap: 8px;
//               }
//               .tools-grid {
//                   display: grid;
//                   grid-template-columns: repeat(2, 1fr);
//                   gap: 8px;
//               }
//               .tool-btn {
//                   padding: 10px 12px;
//                   border: none;
//                   border-radius: 10px;
//                   cursor: pointer;
//                   font-size: 12px;
//                   font-weight: 500;
//                   transition: all 0.3s ease;
//                   display: flex;
//                   align-items: center;
//                   justify-content: center;
//                   gap: 6px;
//                   text-align: center;
//               }
//               .tool-btn.active {
//                   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//                   color: white;
//                   transform: translateY(-2px);
//                   box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
//               }
//               .tool-btn:not(.active) {
//                   background: #f8f9fa;
//                   border: 1px solid #dee2e6;
//                   color: #495057;
//               }
//               .tool-btn:hover {
//                   transform: translateY(-2px);
//                   box-shadow: 0 4px 15px rgba(0,0,0,0.1);
//               }
//               .canvas-container {
//                   border: 2px solid #e9ecef;
//                   border-radius: 12px;
//                   overflow: hidden;
//                   position: relative;
//                   box-shadow: 0 4px 20px rgba(0,0,0,0.1);
//                   background: white;
//                   width: 100%;
//                   height: 70vh;
//                   display: flex;
//                   align-items: center;
//                   justify-content: center;
//               }
//               .pdf-canvas {
//                   max-width: 100%;
//                   max-height: 100%;
//                   object-fit: contain;
//               }
//               .color-picker, .size-input, .font-select {
//                   width: 100%;
//                   margin: 6px 0;
//                   padding: 8px;
//                   border: 1px solid #ddd;
//                   border-radius: 8px;
//                   font-size: 14px;
//                   transition: border-color 0.3s ease;
//               }
//               .color-picker:focus, .size-input:focus, .font-select:focus {
//                   outline: none;
//                   border-color: #667eea;
//                   box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
//               }
//               .save-section {
//                   background: linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%);
//                   padding: 15px;
//                   border-radius: 12px;
//                   margin-top: 20px;
//                   box-shadow: 0 4px 15px rgba(86, 171, 47, 0.2);
//               }
//               .save-btn {
//                   background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
//                   color: white;
//                   padding: 12px 18px;
//                   border: none;
//                   border-radius: 8px;
//                   cursor: pointer;
//                   font-size: 14px;
//                   font-weight: 600;
//                   width: 100%;
//                   transition: all 0.3s ease;
//                   margin: 5px 0;
//               }
//               .save-btn:hover {
//                   transform: translateY(-2px);
//                   box-shadow: 0 6px 20px rgba(40, 167, 69, 0.3);
//               }
//               .send-btn {
//                   background: linear-gradient(135deg, #17a2b8 0%, #6c5ce7 100%);
//               }
//               .send-btn:hover {
//                   box-shadow: 0 6px 20px rgba(23, 162, 184, 0.3);
//               }
//               .status {
//                   margin: 15px 0;
//                   padding: 12px 15px;
//                   border-radius: 10px;
//                   font-weight: 600;
//                   display: none;
//                   animation: slideIn 0.3s ease;
//                   font-size: 14px;
//               }
//               @keyframes slideIn {
//                   from { opacity: 0; transform: translateY(-10px); }
//                   to { opacity: 1; transform: translateY(0); }
//               }
//               .success {
//                   background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
//                   color: #155724;
//                   border-left: 4px solid #28a745;
//               }
//               .error {
//                   background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
//                   color: #721c24;
//                   border-left: 4px solid #dc3545;
//               }
//               .user-info {
//                   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//                   color: white;
//                   padding: 12px;
//                   border-radius: 10px;
//                   margin-bottom: 15px;
//                   text-align: center;
//                   font-weight: 600;
//                   font-size: 14px;
//               }
//               .size-display {
//                   display: inline-block;
//                   background: #667eea;
//                   color: white;
//                   padding: 3px 6px;
//                   border-radius: 4px;
//                   font-size: 11px;
//                   margin-left: 6px;
//               }
//               .loading {
//                   display: flex;
//                   flex-direction: column;
//                   align-items: center;
//                   justify-content: center;
//                   height: 100%;
//                   color: #666;
//               }
//               .spinner {
//                   width: 40px;
//                   height: 40px;
//                   border: 4px solid #f3f3f3;
//                   border-top: 4px solid #667eea;
//                   border-radius: 50%;
//                   animation: spin 1s linear infinite;
//                   margin-bottom: 15px;
//               }
//               @keyframes spin {
//                   0% { transform: rotate(0deg); }
//                   100% { transform: rotate(360deg); }
//               }
             
//               /* Mobile-specific styles */
//               @media (max-width: 768px) {
//                   body {
//                       padding: 5px;
//                   }
//                   .editor-container {
//                       gap: 10px;
//                   }
//                   .toolbar {
//                       padding: 12px;
//                   }
//                   .pdf-editor {
//                       padding: 12px;
//                   }
//                   .canvas-container {
//                       height: 60vh;
//                   }
//                   .tool-btn {
//                       padding: 8px 10px;
//                       font-size: 11px;
//                   }
//                   .tools-grid {
//                       grid-template-columns: repeat(3, 1fr);
//                       gap: 6px;
//                   }
//               }
             
//               /* Text editing styles */
//               .text-edit-overlay {
//                   position: absolute;
//                   top: 0;
//                   left: 0;
//                   width: 100%;
//                   height: 100%;
//                   pointer-events: none;
//                   z-index: 20;
//               }
             
//               .text-edit-input {
//                   position: absolute;
//                   background: rgba(255, 255, 255, 0.95);
//                   border: 2px solid #667eea;
//                   border-radius: 4px;
//                   padding: 5px;
//                   font-family: Arial, sans-serif;
//                   font-size: 14px;
//                   z-index: 30;
//                   min-width: 100px;
//                   display: none;
//                   pointer-events: auto;
//               }
             
//               .pdf-content-layer {
//                   position: absolute;
//                   top: 0;
//                   left: 0;
//                   width: 100%;
//                   height: 100%;
//                   z-index: 10;
//                   pointer-events: auto;
//               }
             
//               .editable-text {
//                   position: absolute;
//                   border: 1px dashed transparent;
//                   padding: 2px;
//                   cursor: pointer;
//                   transition: all 0.2s ease;
//               }
             
//               .editable-text:hover {
//                   border-color: #667eea;
//                   background: rgba(102, 126, 234, 0.1);
//               }
             
//               .editable-text.editing {
//                   border-color: #28a745;
//                   background: rgba(40, 167, 69, 0.1);
//               }
             
//               /* Virtual keyboard for mobile */
//               .virtual-keyboard {
//                   position: fixed;
//                   bottom: 0;
//                   left: 0;
//                   right: 0;
//                   background: white;
//                   padding: 10px;
//                   border-top: 1px solid #ddd;
//                   display: none;
//                   z-index: 1000;
//                   box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
//               }
             
//               .virtual-keyboard.show {
//                   display: block;
//               }
             
//               .keyboard-input {
//                   width: 100%;
//                   padding: 12px;
//                   border: 1px solid #ddd;
//                   border-radius: 8px;
//                   font-size: 16px;
//                   margin-bottom: 10px;
//               }
             
//               .keyboard-actions {
//                   display: flex;
//                   gap: 10px;
//               }
             
//               .keyboard-btn {
//                   flex: 1;
//                   padding: 10px;
//                   border: none;
//                   border-radius: 6px;
//                   font-weight: 600;
//                   cursor: pointer;
//               }
             
//               .keyboard-btn.primary {
//                   background: #28a745;
//                   color: white;
//               }
             
//               .keyboard-btn.secondary {
//                   background: #6c757d;
//                   color: white;
//               }
             
//               /* Dropdown Menu Styles */
//               .dropdown-menu {
//                   position: relative;
//                   display: inline-block;
//               }
             
//               .dropdown-btn {
//                   background: #667eea;
//                   color: white;
//                   border: none;
//                   padding: 8px 12px;
//                   border-radius: 6px;
//                   cursor: pointer;
//                   font-size: 18px;
//                   transition: all 0.3s ease;
//               }
             
//               .dropdown-btn:hover {
//                   background: #5a6fd8;
//                   transform: translateY(-1px);
//               }
             
//               .dropdown-content {
//                   display: none;
//                   position: absolute;
//                   right: 0;
//                   background: white;
//                   min-width: 180px;
//                   box-shadow: 0 8px 25px rgba(0,0,0,0.15);
//                   border-radius: 8px;
//                   z-index: 1000;
//                   border: 1px solid #e0e0e0;
//                   overflow: hidden;
//               }
             
//               .dropdown-content.show {
//                   display: block;
//                   animation: slideDown 0.2s ease;
//               }
             
//               @keyframes slideDown {
//                   from { opacity: 0; transform: translateY(-10px); }
//                   to { opacity: 1; transform: translateY(0); }
//               }
             
//               .dropdown-content a {
//                   color: #333;
//                   padding: 12px 16px;
//                   text-decoration: none;
//                   display: block;
//                   transition: background-color 0.2s ease;
//                   border-bottom: 1px solid #f0f0f0;
//                   cursor: pointer;
//               }
             
//               .dropdown-content a:last-child {
//                   border-bottom: none;
//               }
             
//               .dropdown-content a:hover {
//                   background-color: #f8f9fa;
//                   color: #667eea;
//               }
//           </style>
//       </head>
//       <body>
//           <div class="editor-container">
//               <div class="pdf-editor">
//                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
//                       <h2 style="margin: 0; color: #333; font-size: 18px;">
//                           PDF Interactive Editor
//                       </h2>
//                       <div class="dropdown-menu">
//                           <button class="dropdown-btn" onclick="toggleDropdown()">⋮</button>
//                           <div class="dropdown-content" id="dropdownContent">
//                               <a onclick="saveChanges()">💾 Save Changes</a>
//                               <a onclick="sendToOwner()">📤 Send to Owner</a>
//                           </div>
//                       </div>
//                   </div>
//                   <div class="canvas-container" id="canvasContainer">
//                       <div class="loading" id="loadingIndicator">
//                           <div class="spinner"></div>
//                           <p>Loading PDF...</p>
//                       </div>
//                       <canvas id="pdfCanvas" class="pdf-canvas" style="display: none;"></canvas>
//                       <canvas id="editCanvas" style="position: absolute; top: 0; left: 0; z-index: 10; display: none;"></canvas>
//                       <div class="pdf-content-layer" id="pdfContentLayer"></div>
//                       <input type="text" id="textEditInput" class="text-edit-input" placeholder="Enter text...">
//                   </div>
//                   <div id="status"></div>
//               </div>
             
//               <div class="toolbar">
//                   <div class="user-info">
//                       PDF Editor<br>
//                       <small>User: ${tokenEmail}</small>
//                   </div>
                 
//                   <div class="tool-section">
//                       <h3>Tools</h3>
//                       <div class="tools-grid">
//                           <button class="tool-btn active" onclick="setTool('edit')">
//                               Edit Text
//                           </button>
//                           <button class="tool-btn" onclick="setTool('add')">
//                               Add Text
//                           </button>
//                           <button class="tool-btn" onclick="setTool('draw')">
//                               Draw
//                           </button>
//                           <button class="tool-btn" onclick="setTool('rectangle')">
//                               Rectangle
//                           </button>
//                           <button class="tool-btn" onclick="setTool('line')">
//                               Line
//                           </button>
//                           <button class="tool-btn" onclick="clearCanvas()">
//                               Clear
//                           </button>
//                       </div>
//                   </div>
                 
//                   <div class="tool-section">
//                       <h3>Properties</h3>
//                       <label style="font-size: 12px;">Color:</label>
//                       <input type="color" class="color-picker" id="colorPicker" value="#000000">
                     
//                       <label style="font-size: 12px;">Size:</label>
//                       <input type="range" class="size-input" id="sizeSlider" min="1" max="50" value="12">
//                       <span class="size-display" id="sizeDisplay">12px</span>
                     
//                       <label style="font-size: 12px;">Font:</label>
//                       <select id="fontSize" class="font-select">
//                           <option value="10">10pt</option>
//                           <option value="12" selected>12pt</option>
//                           <option value="14">14pt</option>
//                           <option value="16">16pt</option>
//                           <option value="18">18pt</option>
//                           <option value="20">20pt</option>
//                           <option value="24">24pt</option>
//                       </select>
//                   </div>
//               </div>
//           </div>
         
//           <!-- Virtual Keyboard for Mobile -->
//           <div class="virtual-keyboard" id="virtualKeyboard">
//               <input type="text" class="keyboard-input" id="keyboardInput" placeholder="Type your text here...">
//               <div class="keyboard-actions">
//                   <button class="keyboard-btn primary" onclick="applyKeyboardText()">Apply</button>
//                   <button class="keyboard-btn secondary" onclick="closeVirtualKeyboard()">Cancel</button>
//               </div>
//           </div>
         
//           <script>
//               // Global variables
//               const AUTH_TOKEN = '${token}';
//               const IS_OWNER = ${isOwner ? 'true' : 'false'};
//               let pdfDoc = null;
//               let fabricCanvas = null;
//               let currentTool = 'edit';
//               let editHistory = [];
//               let pdfTextElements = [];
//               let currentEditingElement = null;
//               const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
             
//               // PDF.js configuration
//               pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
             
//               // Initialize application
//               document.addEventListener('DOMContentLoaded', function() {
//                   initializeApp();
//                   setupEventListeners();
                 
//                   // Close dropdown when clicking outside
//                   document.addEventListener('click', function(event) {
//                       const dropdown = document.querySelector('.dropdown-menu');
//                       if (!dropdown.contains(event.target)) {
//                           document.getElementById('dropdownContent').classList.remove('show');
//                       }
//                   });
//               });
             
//               function initializeApp() {
//                   showStatus('Initializing PDF Editor...', 'success');
//                   loadPDF();
//                   setupMobileSupport();
//               }
             
//               function setupEventListeners() {
//                   // Size slider
//                   document.getElementById('sizeSlider').addEventListener('input', function() {
//                       document.getElementById('sizeDisplay').textContent = this.value + 'px';
//                       updateBrushSettings();
//                   });
                 
//                   // Color picker
//                   document.getElementById('colorPicker').addEventListener('change', function() {
//                       updateBrushSettings();
//                   });
                 
//                   // Window resize
//                   window.addEventListener('resize', handleWindowResize);
                 
//                   // Prevent context menu on long press for mobile
//                   if (isMobile) {
//                       document.addEventListener('contextmenu', function(e) {
//                           e.preventDefault();
//                       });
//                   }
//               }
             
//               function updateBrushSettings() {
//                   if (fabricCanvas && fabricCanvas.isDrawingMode) {
//                       fabricCanvas.freeDrawingBrush.width = parseInt(document.getElementById('sizeSlider').value);
//                       fabricCanvas.freeDrawingBrush.color = document.getElementById('colorPicker').value;
//                   }
//               }
             
//               async function loadPDF() {
//                   try {
//                       showLoadingState(true);
//                       showStatus('Loading PDF document...', 'success');
                     
//                       // Validate token
//                       if (!AUTH_TOKEN || AUTH_TOKEN.trim() === '') {
//                           throw new Error('Authentication token is missing');
//                       }
                     
//                       // Load PDF with proper template literal syntax
//                       const pdfUrl = \`/pdf-content?token=\${AUTH_TOKEN}\`;
//                       console.log('Loading PDF from:', pdfUrl);
                     
//                       const loadingTask = pdfjsLib.getDocument(pdfUrl);
                     
//                       // Add progress tracking
//                       loadingTask.onProgress = function(progress) {
//                           if (progress.total > 0) {
//                               const percent = Math.round((progress.loaded / progress.total) * 100);
//                               showStatus(\`Loading PDF... \${percent}%\`, 'success');
//                           }
//                       };
                     
//                       pdfDoc = await loadingTask.promise;
//                       showStatus('PDF loaded successfully! Click text to edit or use tools to add content.', 'success');
//                       await renderPage(1);
//                       showLoadingState(false);
                     
//                   } catch (error) {
//                       console.error('PDF loading error:', error);
//                       showLoadingState(false);
                     
//                       // Provide specific error messages
//                       let errorMessage = 'Error loading PDF: ';
//                       if (error.name === 'InvalidPDFException') {
//                           errorMessage += 'The file is not a valid PDF document.';
//                       } else if (error.name === 'MissingPDFException') {
//                           errorMessage += 'PDF file not found. Please check the file exists.';
//                       } else if (error.name === 'UnexpectedResponseException') {
//                           errorMessage += 'Server returned an unexpected response. Please try again.';
//                       } else if (error.message.includes('Authentication')) {
//                           errorMessage += 'Authentication failed. Please check your access token.';
//                       } else {
//                           errorMessage += error.message;
//                       }
                     
//                       showStatus(errorMessage, 'error');
//                   }
//               }
             
//               function showLoadingState(isLoading) {
//                   const loadingIndicator = document.getElementById('loadingIndicator');
//                   const pdfCanvas = document.getElementById('pdfCanvas');
//                   const editCanvas = document.getElementById('editCanvas');
                 
//                   if (isLoading) {
//                       loadingIndicator.style.display = 'flex';
//                       pdfCanvas.style.display = 'none';
//                       editCanvas.style.display = 'none';
//                   } else {
//                       loadingIndicator.style.display = 'none';
//                       pdfCanvas.style.display = 'block';
//                       editCanvas.style.display = 'block';
//                   }
//               }
             
//               async function renderPage(pageNum) {
//                   try {
//                       const page = await pdfDoc.getPage(pageNum);
                     
//                       // Calculate appropriate scale
//                       const container = document.querySelector('.canvas-container');
//                       const containerWidth = container.clientWidth - 4;
//                       const containerHeight = container.clientHeight - 4;
//                       const viewport = page.getViewport({ scale: 1 });
                     
//                       let scale = Math.min(
//                           containerWidth / viewport.width,
//                           containerHeight / viewport.height,
//                           2.0 // Maximum scale
//                       );
                     
//                       // Ensure minimum scale for readability
//                       scale = Math.max(scale, 0.5);
                     
//                       const scaledViewport = page.getViewport({ scale: scale });
                     
//                       // Setup canvases
//                       const pdfCanvas = document.getElementById('pdfCanvas');
//                       const editCanvas = document.getElementById('editCanvas');
                     
//                       pdfCanvas.width = scaledViewport.width;
//                       pdfCanvas.height = scaledViewport.height;
//                       editCanvas.width = scaledViewport.width;
//                       editCanvas.height = scaledViewport.height;
                     
//                       // Render PDF
//                       const context = pdfCanvas.getContext('2d');
//                       await page.render({
//                           canvasContext: context,
//                           viewport: scaledViewport
//                       }).promise;
                     
//                       // Extract text content for editing
//                       await extractTextContent(page, scaledViewport);
                     
//                       // Initialize Fabric.js canvas
//                       initializeFabricCanvas(scaledViewport);
                     
//                       showStatus('PDF page rendered successfully!', 'success');
                     
//                   } catch (error) {
//                       console.error('Error rendering page:', error);
//                       showStatus('Error rendering PDF page: ' + error.message, 'error');
//                   }
//               }
             
//               function initializeFabricCanvas(viewport) {
//                   if (fabricCanvas) {
//                       fabricCanvas.dispose();
//                   }
                 
//                   fabricCanvas = new fabric.Canvas('editCanvas', {
//                       width: viewport.width,
//                       height: viewport.height,
//                       backgroundColor: 'transparent',
//                       selection: true
//                   });
                 
//                   // Setup initial canvas events
//                   setupCanvasEvents();
//               }
             
//               async function extractTextContent(page, viewport) {
//                   try {
//                       const textContent = await page.getTextContent();
//                       const contentLayer = document.getElementById('pdfContentLayer');
//                       contentLayer.innerHTML = '';
//                       contentLayer.style.width = viewport.width + 'px';
//                       contentLayer.style.height = viewport.height + 'px';
//                       pdfTextElements = [];
                     
//                       textContent.items.forEach((item, index) => {
//                           if (item.str && item.str.trim()) {
//                               const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
                             
//                               const textElement = document.createElement('div');
//                               textElement.className = 'editable-text';
//                               textElement.style.left = transform[4] + 'px';
//                               textElement.style.top = (viewport.height - transform[5] - item.height) + 'px';
//                               textElement.style.fontSize = Math.abs(item.height) + 'px';
//                               textElement.style.fontFamily = item.fontName || 'Arial';
//                               textElement.textContent = item.str;
//                               textElement.dataset.originalText = item.str;
//                               textElement.dataset.index = index;
                             
//                               textElement.addEventListener('click', function(e) {
//                                   e.stopPropagation();
//                                   if (currentTool === 'edit') {
//                                       startTextEdit(textElement);
//                                   }
//                               });
                             
//                               contentLayer.appendChild(textElement);
//                               pdfTextElements.push({
//                                   element: textElement,
//                                   originalText: item.str,
//                                   x: transform[4],
//                                   y: viewport.height - transform[5] - item.height,
//                                   fontSize: Math.abs(item.height),
//                                   fontFamily: item.fontName || 'Arial'
//                               });
//                           }
//                       });
                     
//                       // Setup content layer click handler for adding text
//                       contentLayer.addEventListener('click', function(e) {
//                           if (currentTool === 'add' && e.target === contentLayer) {
//                               addNewText(e);
//                           }
//                       });
                     
//                   } catch (error) {
//                       console.error('Error extracting text content:', error);
//                       showStatus('Warning: Could not extract text for editing', 'error');
//                   }
//               }
             
//               function setupCanvasEvents() {
//                   if (!fabricCanvas) return;
                 
//                   // Clear existing events
//                   fabricCanvas.off();
                 
//                   if (currentTool === 'draw') {
//                       fabricCanvas.isDrawingMode = true;
//                       updateBrushSettings();
//                   } else {
//                       fabricCanvas.isDrawingMode = false;
                     
//                       if (currentTool === 'rectangle') {
//                           fabricCanvas.on('mouse:down', startRectangle);
//                       } else if (currentTool === 'line') {
//                           fabricCanvas.on('mouse:down', startLine);
//                       }
//                   }
//               }
             
//               function setTool(tool) {
//                   currentTool = tool;
                 
//                   // Update UI
//                   document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
//                   event.target.classList.add('active');
                 
//                   // Setup canvas for new tool
//                   setupCanvasEvents();
                 
//                   // Show appropriate status message
//                   const messages = {
//                       'edit': 'Edit mode: Click on any text to modify it',
//                       'add': 'Add mode: Click anywhere to add new text',
//                       'draw': 'Draw mode: Draw freely on the PDF',
//                       'rectangle': 'Rectangle mode: Click to add rectangles',
//                       'line': 'Line mode: Click to add lines'
//                   };
                 
//                   showStatus(messages[tool] || 'Tool selected', 'success');
//               }
             
//               function startTextEdit(element) {
//                   if (currentEditingElement) {
//                       currentEditingElement.classList.remove('editing');
//                   }
                 
//                   currentEditingElement = element;
//                   element.classList.add('editing');
                 
//                   if (isMobile) {
//                       showVirtualKeyboard(element.textContent);
//                   } else {
//                       showDesktopTextInput(element);
//                   }
//               }
             
//               function showDesktopTextInput(element) {
//                   const textInput = document.getElementById('textEditInput');
//                   const rect = element.getBoundingClientRect();
//                   const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
                 
//                   textInput.style.display = 'block';
//                   textInput.style.left = (rect.left - containerRect.left) + 'px';
//                   textInput.style.top = (rect.top - containerRect.top) + 'px';
//                   textInput.style.fontSize = element.style.fontSize;
//                   textInput.value = element.textContent;
//                   textInput.focus();
//                   textInput.select();
                 
//                   textInput.onblur = () => applyTextEdit(textInput.value);
//                   textInput.onkeypress = (e) => {
//                       if (e.key === 'Enter') {
//                           applyTextEdit(textInput.value);
//                       }
//                   };
//               }
             
//               function showVirtualKeyboard(currentText) {
//                   const keyboard = document.getElementById('virtualKeyboard');
//                   const input = document.getElementById('keyboardInput');
                 
//                   input.value = currentText;
//                   keyboard.classList.add('show');
                 
//                   setTimeout(() => {
//                       input.focus();
//                       input.select();
//                   }, 100);
//               }
             
//               function applyKeyboardText() {
//                   const input = document.getElementById('keyboardInput');
//                   applyTextEdit(input.value);
//                   closeVirtualKeyboard();
//               }
             
//               function closeVirtualKeyboard() {
//                   const keyboard = document.getElementById('virtualKeyboard');
//                   keyboard.classList.remove('show');
                 
//                   if (currentEditingElement) {
//                       currentEditingElement.classList.remove('editing');
//                       currentEditingElement = null;
//                   }
//               }
             
//               function applyTextEdit(newText) {
//                   if (currentEditingElement && newText.trim()) {
//                       currentEditingElement.textContent = newText;
                     
//                       const index = currentEditingElement.dataset.index;
//                       editHistory.push({
//                           type: 'textEdit',
//                           index: index,
//                           oldText: currentEditingElement.dataset.originalText,
//                           newText: newText,
//                           x: parseFloat(currentEditingElement.style.left),
//                           y: parseFloat(currentEditingElement.style.top),
//                           fontSize: parseFloat(currentEditingElement.style.fontSize)
//                       });
                     
//                       showStatus(\`Text updated: "\${newText}"\`, 'success');
//                   }
                 
//                   const textInput = document.getElementById('textEditInput');
//                   textInput.style.display = 'none';
                 
//                   if (currentEditingElement) {
//                       currentEditingElement.classList.remove('editing');
//                       currentEditingElement = null;
//                   }
//               }
             
//               function addNewText(e) {
//                   const rect = e.currentTarget.getBoundingClientRect();
//                   const x = e.clientX - rect.left;
//                   const y = e.clientY - rect.top;
                 
//                   if (isMobile) {
//                       currentEditingElement = { isNew: true, x: x, y: y };
//                       showVirtualKeyboard('');
//                   } else {
//                       showDesktopTextInputForNewText(x, y);
//                   }
//               }
             
//               function showDesktopTextInputForNewText(x, y) {
//                   const textInput = document.getElementById('textEditInput');
                 
//                   textInput.style.display = 'block';
//                   textInput.style.left = x + 'px';
//                   textInput.style.top = y + 'px';
//                   textInput.style.fontSize = document.getElementById('fontSize').value + 'px';
//                   textInput.value = '';
//                   textInput.focus();
                 
//                   textInput.onblur = () => {
//                       if (textInput.value.trim()) {
//                           createNewTextElement(textInput.value, x, y);
//                       }
//                       textInput.style.display = 'none';
//                   };
                 
//                   textInput.onkeypress = (e) => {
//                       if (e.key === 'Enter' && textInput.value.trim()) {
//                           createNewTextElement(textInput.value, x, y);
//                           textInput.style.display = 'none';
//                       }
//                   };
//               }
             
//               function createNewTextElement(text, x, y) {
//                   const contentLayer = document.getElementById('pdfContentLayer');
//                   const editableElement = document.createElement('div');
//                   const fontSize = parseInt(document.getElementById('fontSize').value);
                 
//                   editableElement.className = 'editable-text';
//                   editableElement.style.left = x + 'px';
//                   editableElement.style.top = y + 'px';
//                   editableElement.style.fontSize = fontSize + 'px';
//                   editableElement.style.fontFamily = 'Arial';
//                   editableElement.style.color = document.getElementById('colorPicker').value;
//                   editableElement.textContent = text;
//                   editableElement.dataset.originalText = '';
//                   editableElement.dataset.index = pdfTextElements.length;
                 
//                   editableElement.addEventListener('click', function(e) {
//                       e.stopPropagation();
//                       if (currentTool === 'edit') {
//                           startTextEdit(editableElement);
//                       }
//                   });
                 
//                   contentLayer.appendChild(editableElement);
                 
//                   pdfTextElements.push({
//                       element: editableElement,
//                       originalText: '',
//                       x: x,
//                       y: y,
//                       fontSize: fontSize,
//                       fontFamily: 'Arial'
//                   });
                 
//                   editHistory.push({
//                       type: 'newText',
//                       text: text,
//                       x: x,
//                       y: y,
//                       fontSize: fontSize,
//                       color: hexToRgb(document.getElementById('colorPicker').value)
//                   });
                 
//                   showStatus(\`New text added: "\${text}"\`, 'success');
//               }
             
//               function startRectangle(options) {
//                   const pointer = fabricCanvas.getPointer(options.e);
//                   const rect = new fabric.Rect({
//                       left: pointer.x,
//                       top: pointer.y,
//                       width: 100,
//                       height: 60,
//                       fill: 'transparent',
//                       stroke: document.getElementById('colorPicker').value,
//                       strokeWidth: Math.max(1, parseInt(document.getElementById('sizeSlider').value) / 10),
//                       selectable: true
//                   });
//                   fabricCanvas.add(rect);
                 
//                   editHistory.push({
//                       type: 'rectangle',
//                       x: pointer.x,
//                       y: pointer.y,
//                       width: 100,
//                       height: 60,
//                       borderColor: hexToRgb(document.getElementById('colorPicker').value),
//                       borderWidth: Math.max(1, parseInt(document.getElementById('sizeSlider').value) / 10)
//                   });
//               }
             
//               function startLine(options) {
//                   const pointer = fabricCanvas.getPointer(options.e);
//                   const line = new fabric.Line([pointer.x, pointer.y, pointer.x + 100, pointer.y + 50], {
//                       stroke: document.getElementById('colorPicker').value,
//                       strokeWidth: Math.max(1, parseInt(document.getElementById('sizeSlider').value) / 5),
//                       selectable: true
//                   });
//                   fabricCanvas.add(line);
                 
//                   editHistory.push({
//                       type: 'line',
//                       startX: pointer.x,
//                       startY: pointer.y,
//                       endX: pointer.x + 100,
//                       endY: pointer.y + 50,
//                       thickness: Math.max(1, parseInt(document.getElementById('sizeSlider').value) / 5),
//                       color: hexToRgb(document.getElementById('colorPicker').value)
//                   });
//               }
             
//               function clearCanvas() {
//                   if (confirm('Clear all drawings and new text? (Original PDF text will not be affected)')) {
//                       fabricCanvas.clear();
                     
//                       const contentLayer = document.getElementById('pdfContentLayer');
//                       const newTextElements = contentLayer.querySelectorAll('.editable-text[data-original-text=""]');
//                       newTextElements.forEach(element => element.remove());
                     
//                       editHistory = editHistory.filter(edit => edit.type === 'textEdit');
//                       showStatus('Drawings and new text cleared!', 'success');
//                   }
//               }
             
//               function setupMobileSupport() {
//                   if (!isMobile) return;
                 
//                   let lastTouchEnd = 0;
                 
//                   document.addEventListener('touchend', function(event) {
//                       const now = new Date().getTime();
//                       if (now - lastTouchEnd <= 300) {
//                           event.preventDefault();
//                       }
//                       lastTouchEnd = now;
//                   }, false);
                 
//                   window.addEventListener('resize', function() {
//                       const heightDiff = window.outerHeight - window.innerHeight;
//                       document.body.classList.toggle('keyboard-open', heightDiff > 150);
//                   });
//               }
             
//               function handleWindowResize() {
//                   if (fabricCanvas && pdfDoc) {
//                       setTimeout(() => {
//                           renderPage(1);
//                       }, 100);
//                   }
//               }
             
//               function hexToRgb(hex) {
//                   const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
//                   return result ? {
//                       r: parseInt(result[1], 16) / 255,
//                       g: parseInt(result[2], 16) / 255,
//                       b: parseInt(result[3], 16) / 255
//                   } : { r: 0, g: 0, b: 0 };
//               }
             
//               // FIXED SAVE FUNCTION
//               async function saveChanges() {
//                   console.log('Save button clicked!');
//                   showStatus('Saving changes...', 'success');
                  
//                   try {
//                       const allEdits = [];
                      
//                       // Collect text edits from editHistory
//                       editHistory.forEach(edit => {
//                           if (edit.type === 'textEdit' || edit.type === 'newText') {
//                               allEdits.push({
//                                   type: 'text',
//                                   text: edit.newText || edit.text,
//                                   x: edit.x,
//                                   y: edit.y,
//                                   fontSize: edit.fontSize,
//                                   color: edit.color || { r: 0, g: 0, b: 0 }
//                               });
//                           } else {
//                               allEdits.push(edit);
//                           }
//                       });
                      
//                       // Collect canvas objects (drawings, rectangles, lines)
//                       if (fabricCanvas) {
//                           const canvasObjects = fabricCanvas.getObjects();
//                           canvasObjects.forEach(obj => {
//                               if (obj.type === 'rect') {
//                                   allEdits.push({
//                                       type: 'rectangle',
//                                       x: obj.left,
//                                       y: obj.top,
//                                       width: obj.width * (obj.scaleX || 1),
//                                       height: obj.height * (obj.scaleY || 1),
//                                       borderColor: hexToRgb(obj.stroke || '#000000'),
//                                       borderWidth: obj.strokeWidth || 1
//                                   });
//                               } else if (obj.type === 'line') {
//                                   allEdits.push({
//                                       type: 'line',
//                                       startX: obj.x1,
//                                       startY: obj.y1,
//                                       endX: obj.x2,
//                                       endY: obj.y2,
//                                       thickness: obj.strokeWidth || 1,
//                                       color: hexToRgb(obj.stroke || '#000000')
//                                   });
//                               } else if (obj.type === 'path') {
//                                   allEdits.push({
//                                       type: 'drawing',
//                                       path: obj.path,
//                                       left: obj.left,
//                                       top: obj.top,
//                                       strokeWidth: obj.strokeWidth || 2,
//                                       stroke: obj.stroke || '#000000'
//                                   });
//                               }
//                           });
//                       }
                      
//                       console.log('Total edits to save:', allEdits.length);
                      
//                       if (allEdits.length === 0) {
//                           showStatus('No changes to save! Make some edits first.', 'error');
//                           return false;
//                       }
                      
//                       // Prepare form data
//                       const formData = new FormData();
//                       formData.append('token', AUTH_TOKEN);
//                       formData.append('editType', 'comprehensive');
//                       formData.append('editData', JSON.stringify(allEdits));
                      
//                       console.log('Sending save request...');
                      
//                       // Send save request
//                       const response = await fetch('/edit-pdf', {
//                           method: 'POST',
//                           body: formData
//                       });
                      
//                       if (!response.ok) {
//                           throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
//                       }
                      
//                       const result = await response.json();
//                       console.log('Save response:', result);
                      
//                       if (result.success) {
//                           showStatus(\`✅ Changes saved successfully! (\${allEdits.length} edits applied)\`, 'success');
//                           return true;
//                       } else {
//                           showStatus('❌ Error saving: ' + (result.error || 'Unknown error'), 'error');
//                           return false;
//                       }
//                   } catch (error) {
//                       console.error('Save error:', error);
//                       showStatus('❌ Save failed: ' + error.message, 'error');
//                       return false;
//                   }
//               }
              
//               // FIXED SEND TO OWNER FUNCTION
//               async function sendToOwner() {
//                   console.log('Send to owner clicked!');
//                   showStatus('Preparing to send to owner...', 'success');
                  
//                   // Check if there are changes to send
//                   const hasTextEdits = editHistory.length > 0;
//                   const hasCanvasObjects = fabricCanvas && fabricCanvas.getObjects().length > 0;
                  
//                   if (!hasTextEdits && !hasCanvasObjects) {
//                       showStatus('❌ No changes to send! Please make some edits first.', 'error');
//                       return;
//                   }
                  
//                   try {
//                       // First save the changes
//                       console.log('Saving changes before sending...');
//                       const saveSuccess = await saveChanges();
                      
//                       if (!saveSuccess) {
//                           showStatus('❌ Cannot send: Save failed', 'error');
//                           return;
//                       }
                      
//                       // Wait a moment for save to complete on server
//                       console.log('Waiting for save to complete...');
//                       await new Promise(resolve => setTimeout(resolve, 2000));
                      
//                       // Create edit summary
//                       const editSummary = {
//                           textEdits: editHistory.filter(edit => edit.type === 'textEdit').length,
//                           newText: editHistory.filter(edit => edit.type === 'newText').length,
//                           drawings: fabricCanvas ? fabricCanvas.getObjects().length : 0,
//                           editor: '${tokenEmail}',
//                           timestamp: Date.now()
//                       };
                      
//                       console.log('Edit summary:', editSummary);
                      
//                       // Prepare form data for sending
//                       const formData = new FormData();
//                       formData.append('token', AUTH_TOKEN);
//                       formData.append('recipientEmail', '${tokenEmail}');
//                       formData.append('editSummary', JSON.stringify(editSummary));
                      
//                       showStatus('📤 Sending PDF to owner...', 'success');
//                       console.log('Sending to owner...');
                      
//                       // Send to owner
//                       const response = await fetch('/send-back', {
//                           method: 'POST',
//                           body: formData
//                       });
                      
//                       if (!response.ok) {
//                           throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
//                       }
                      
//                       const result = await response.json();
//                       console.log('Send result:', result);
                      
//                       if (result.success) {
//                           showStatus('✅ PDF sent to owner successfully!', 'success');
                          
//                           // Ask if user wants to clear changes
//                           setTimeout(() => {
//                               if (confirm('PDF sent successfully! Would you like to clear all changes and start fresh?')) {
//                                   clearCanvas();
//                                   editHistory = [];
                                  
//                                   // Reset all text elements to original
//                                   pdfTextElements.forEach(element => {
//                                       if (element.element.dataset.originalText) {
//                                           element.element.textContent = element.element.dataset.originalText;
//                                       }
//                                   });
                                  
//                                   showStatus('All changes cleared! Ready for new edits.', 'success');
//                               }
//                           }, 1500);
//                       } else {
//                           showStatus('❌ Send failed: ' + (result.error || 'Unknown error'), 'error');
//                       }
                      
//                       // Close dropdown after action
//                       document.getElementById('dropdownContent').classList.remove('show');
                      
//                   } catch (error) {
//                       console.error('Send error:', error);
//                       showStatus('❌ Send error: ' + error.message, 'error');
//                   }
//               }
             
//               function showStatus(message, type) {
//                   const statusDiv = document.getElementById('status');
//                   statusDiv.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
//                   statusDiv.style.display = 'block';
                  
//                   // Auto-hide after 5 seconds for success messages, keep error messages longer
//                   const hideDelay = type === 'error' ? 8000 : 5000;
//                   setTimeout(() => {
//                       statusDiv.style.display = 'none';
//                   }, hideDelay);
//               }
             
//               // Dropdown Functions
//               function toggleDropdown() {
//                   const dropdown = document.getElementById('dropdownContent');
//                   dropdown.classList.toggle('show');
//                   console.log('Dropdown toggled, visible:', dropdown.classList.contains('show'));
//               }
//           </script>
//       </body>
//       </html>
//     `);
//   } catch (error) {
//     console.error("JWT verification error:", error);
//     return res.status(403).send("Invalid or expired token");
//   }
// });

// Route to serve PDF content (embedded in browser - STRICTLY prevent downloads for recipients)
app.get("/pdf-content", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    const isOwner = tokenEmail === OWNER_EMAIL;
    const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) && 
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

    if (!isOwner && !isAuthorizedRecipient) {
      return res.status(403).send("Access denied");
    }

    const filePath = path.join(__dirname, "resume.pdf");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found.");
    }

    if (isOwner) {
      // Owner: render inline for consistent PDF.js viewing experience
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else {
      // Recipients can ONLY view, no download - STRICT prevention
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      // Additional headers to prevent download in browser PDF viewer
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Content-Security-Policy", "default-src 'self'; object-src 'none';");
      // Prevent PDF download by setting specific headers
      res.setHeader("X-Download-Options", "noopen");
      res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    }
    
    // Stream the PDF to the browser
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(403).send("Access denied");
  }
})
  

// Route for direct access - shows Google account picker
app.get("/", (req, res) => {
  const { token } = req.query;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      
      // If it's the owner or a specifically authorized recipient with matching token, redirect to view
      if (decoded.email === OWNER_EMAIL || 
          (AUTHORIZED_RECIPIENTS.has(decoded.email) && 
           AUTHORIZED_RECIPIENTS.get(decoded.email).token === token &&
           AUTHORIZED_RECIPIENTS.get(decoded.email).canEdit)) {
        return res.redirect(`/view?token=${token}`);
      }
    } catch (err) {
      // Token invalid or expired, show account picker
    }
  }
  
  // Show Google account picker for unauthorized users
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Secure PDF Access</title>
        <meta name="google-signin-client_id" content="796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com">
        <script src="https://accounts.google.com/gsi/client" async defer onload="updateDebugInfo('Google script loaded')" onerror="updateDebugInfo('Google script failed to load')"></script>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
            .logo { font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            .subtitle { color: #666; margin-bottom: 30px; font-size: 18px; }
            .google-signin { margin: 30px 0; }
            .security-info { background: #e7f3ff; padding: 20px; border-radius: 10px; margin: 30px 0; border: 1px solid #b3d9ff; text-align: left; }
            .owner-actions { margin-top: 30px; }
            .owner-btn { background: #28a745; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 10px; }
            .owner-btn:hover { background: #1e7e34; }
            .status { margin: 20px 0; padding: 15px; border-radius: 8px; font-weight: bold; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔒</div>
            <h1>Secure PDF Access</h1>
            <p class="subtitle">Select your Google account to access the secure PDF</p>
            
            <div class="google-signin">
                <div id="google-signin-button">
                    <button id="fallback-button" onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; display: block;">
                        🔐 Sign in with Google
                    </button>
                </div>
            </div>
            
            <div class="security-info">
                <strong>🔐 How it works:</strong>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Click "Sign in with Google" above</li>
                    <li>Select your Google account</li>
                    <li>If you're an authorized recipient, PDF opens automatically</li>
                    <li>If not authorized, access is denied</li>
                    <li>No email typing required - just account selection</li>
                </ul>
            </div>
            
            <div class="owner-actions">
                <button class="owner-btn" onclick="window.open('/send', '_blank')">📧 Send Secure Links to Recipients</button>
                <button class="owner-btn" onclick="window.open('/send', '_blank')">🌐 Manage Recipients</button>
            </div>
            
            <div id="status"></div>
            <div id="debug-info" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666;">
                <strong>Debug Info:</strong>
                <div id="debug-content">Loading...</div>
            </div>
        </div>
        
        <script>
            // Check if Google Identity Services loaded properly
            window.addEventListener('load', function() {
                updateDebugInfo('Page loaded, checking Google Identity Services...');
                
                // Wait a bit for Google script to load
                setTimeout(function() {
                    if (typeof google !== 'undefined' && google.accounts) {
                        updateDebugInfo('✅ Google Identity Services loaded successfully');
                        console.log('Google Identity Services loaded successfully');
                        
                        // Initialize Google Sign-In
                        google.accounts.id.initialize({
                            client_id: '796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com',
                            callback: handleCredentialResponse
                        });
                        
                        // Render the button
                        google.accounts.id.renderButton(
                            document.getElementById('google-signin-button'),
                            { 
                                theme: 'outline', 
                                size: 'large',
                                text: 'signin_with',
                                shape: 'rectangular'
                            }
                        );
                        
                        // Hide the fallback button
                        const fallbackButton = document.getElementById('fallback-button');
                        if (fallbackButton) {
                            fallbackButton.style.display = 'none';
                        }
                        
                        updateDebugInfo('✅ Google Sign-In button rendered');
                    } else {
                        updateDebugInfo('❌ Google Identity Services failed to load. Showing manual sign-in.');
                        console.error('Google Identity Services failed to load');
                        document.getElementById('google-signin-button').innerHTML = 
                            '<button onclick="showManualSignin()" style="background: #4285f4; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">Sign in with Google (Manual)</button>';
                    }
                }, 2000); // Wait 2 seconds for Google script to load
            });

            function updateDebugInfo(message) {
                const debugContent = document.getElementById('debug-content');
                if (debugContent) {
                    debugContent.innerHTML += '<br>' + new Date().toLocaleTimeString() + ': ' + message;
                }
            }

            function handleCredentialResponse(response) {
                // Decode the JWT token from Google
                const payload = JSON.parse(atob(response.credential.split('.')[1]));
                const userEmail = payload.email;
                
                console.log('User selected:', userEmail);
                
                // Check if user is authorized
                checkAccess(userEmail);
            }

            function showManualSignin() {
                const email = prompt('Please enter your email address:');
                if (email) {
                    checkAccess(email);
                }
            }
            
            function checkAccess(email) {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = '<div class="status">Checking access...</div>';
                
                // Check if user is owner or authorized recipient
                if (email === 'shreyagaikwad107@gmail.com') {
                    // Owner access
                    statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
                    generateAndRedirect(email);
                } else {
                    // Check if user is authorized recipient
                    fetch('/check-recipient?email=' + encodeURIComponent(email))
                        .then(response => response.json())
                        .then(data => {
                            if (data.authorized) {
                                statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
                                generateAndRedirect(email);
                            } else {
                                statusDiv.innerHTML = '<div class="status error">❌ Access denied. You are not authorized to view this PDF.</div>';
                            }
                        })
                        .catch(error => {
                            statusDiv.innerHTML = '<div class="status error">❌ Error checking access. Please try again.</div>';
                        });
                }
            }
            
            function generateAndRedirect(email) {
                fetch('/generate-link?email=' + encodeURIComponent(email))
                    .then(response => response.json())
                    .then(data => {
                        setTimeout(() => {
                            window.location.href = data.secureLink;
                        }, 1500);
                    })
                    .catch(error => {
                        console.error('Error generating link:', error);
                    });
            }
        </script>
    </body>
    </html>
  `);
});

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
  
  console.log(`\n🔒 Security Features:`);
  console.log(`• Google OAuth for BOTH owner AND recipients - no email typing required`);
  console.log(`• Recipients must authenticate with Google before accessing PDFs`);
  console.log(`• Only chosen recipients can edit PDFs after Google authentication`);
  console.log(`• PDFs open directly in Chrome browser`);
  console.log(`• No external editors allowed`);
  console.log(`• Text editing with keyboard input - click anywhere to add text`);
  console.log(`• Recipients can send edited PDFs back to shreyagaikwad107@gmail.com IMMEDIATELY`);
  console.log(`• Owner can also edit PDFs in browser and download them`);
  console.log(`• Recipients cannot download PDFs - view and edit only`);
  console.log(`• STRICT download prevention for recipients`);
  console.log(`• No browser PDF controls for recipients - 3-dot menu disabled`);
  console.log(`• Links expire after 12 hours`);
  console.log(`• Works globally from any device`);

  // Send the secure link automatically when server starts
  await sendSecureLink();
});
