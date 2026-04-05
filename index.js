const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const axios = require('axios');

// API Configuration
const API_KEY = "";
const AI_MODEL = "z-ai/glm-4.5-air:free";

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_rss_brand');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["RSS BRAND", "Chrome", "2.1"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();
            console.log('\n📱 RSS BRAND: SCAN THIS QR CODE 📱\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ RSS BRAND BOT IS ONLINE (AI + Status Saver + Anti-ViewOnce)');
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out! Please delete "session_rss_brand" folder and scan again.');
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;
        
        // ---------------------------------------------------------
        // 1. ANTI-VIEW ONCE SYSTEM (Auto Download 1-View Media)
        // ---------------------------------------------------------
        const viewOnceMsg = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        
        if (viewOnceMsg && !msg.key.fromMe) {
            try {
                console.log('👁️ View Once Message Detected!');
                const media = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const messageType = Object.keys(viewOnceMsg.message)[0]; 
                
                await sock.sendMessage(sender, { text: "🚨 *View Once Unlocked by RSS BRAND* 🚨" }, { quoted: msg });
                
                if (messageType === 'imageMessage') {
                    await sock.sendMessage(sender, { image: media, caption: "📸 Saved View-Once Picture" });
                } else if (messageType === 'videoMessage') {
                    await sock.sendMessage(sender, { video: media, caption: "🎥 Saved View-Once Video" });
                } else if (messageType === 'audioMessage') {
                    await sock.sendMessage(sender, { audio: media, mimetype: 'audio/ogg; codecs=opus', ptt: true }); // ptt: true makes it a voice note
                }
            } catch (err) {
                console.log("Anti-View Once Error:", err);
            }
            return; // Yahan return lazmi hai taake AI iska reply na kare
        }

        // Khud ke messages aur broadcast status ko process mat karo
        if (msg.key.fromMe || sender === 'status@broadcast') return;

        // Message ka text nikalna
        const text = (msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "").toLowerCase().trim();

        if (!text) return;

        // ---------------------------------------------------------
        // 2. STATUS DOWNLOADER COMMAND (.save)
        // ---------------------------------------------------------
        if (text === '.save' || text === 'save') {
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            // Agar kisi ne status par reply kiya hai ya kisi message par
            if (contextInfo && contextInfo.quotedMessage) {
                try {
                    await sock.sendMessage(sender, { 
                        forward: { 
                            key: { 
                                remoteJid: contextInfo.remoteJid, 
                                id: contextInfo.stanzaId, 
                                participant: contextInfo.participant 
                            }, 
                            message: contextInfo.quotedMessage 
                        } 
                    }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(sender, { text: "❌ Error: Media save nahi ho saka." });
                }
            } else {
                await sock.sendMessage(sender, { text: "⚠️ Reply to a Status or Media with *.save* to download it." });
            }
            return;
        }

        // ---------------------------------------------------------
        // 3. MENU COMMAND
        // ---------------------------------------------------------
        if (text === 'menu' || text === '.menu' || text === 'help') {
            const menuText = `✨ *RSS BRAND AI SYSTEM* ✨\n\n` +
                             `👤 *Developer:* RSS BRAND\n` +
                             `🤖 *AI Model:* GLM-4.5 Air\n\n` +
                             `*COMMANDS:* \n` +
                             `📝 *[Any text]* - AI se direct baat karein\n` +
                             `⬇️ *.save* - Kisi ke Status par reply karke usay download karein\n` +
                             `👁️ *Anti-View Once* - 1-time photos/voice automatically save ho jayengi\n` +
                             `📋 *.menu* - Ye list dekhne ke liye\n\n` +
                             `_System Auto-Reply is Active._`;
            
            await sock.sendMessage(sender, { text: menuText }, { quoted: msg });
            return;
        }

        // ---------------------------------------------------------
        // 4. AI AUTO-REPLY SYSTEM (Fake Typing + Recording)
        // ---------------------------------------------------------
        try {
            await sock.sendPresenceUpdate('recording', sender);
            await new Promise(res => setTimeout(res, 1500));
            await sock.sendPresenceUpdate('composing', sender);

            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: AI_MODEL,
                    messages: [{ role: 'user', content: text }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/rssbrand',
                        'X-Title': 'RSS Brand WhatsApp Bot'
                    }
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const aiReply = response.data.choices[0].message.content;
                await sock.sendMessage(sender, { text: aiReply }, { quoted: msg });
            }

            await sock.sendPresenceUpdate('paused', sender);

        } catch (error) {
            console.error("AI Error:", error.response?.data || error.message);
            await sock.sendPresenceUpdate('paused', sender);
        }
    });
}

startBot();
