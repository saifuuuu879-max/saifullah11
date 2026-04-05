const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const axios = require('axios');

// API Configuration
const API_KEY = "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";
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
            console.log('✅ RSS BRAND BOT IS ONLINE (AI + Status Saver + Anti-ViewOnce Fix)');
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
        // 1. ANTI-VIEW ONCE SYSTEM (FIXED & 100% WORKING)
        // ---------------------------------------------------------
        const viewOnce = msg.message?.viewOnceMessage?.message || 
                         msg.message?.viewOnceMessageV2?.message || 
                         msg.message?.viewOnceMessageV2Extension?.message;
        
        if (viewOnce && !msg.key.fromMe) {
            try {
                console.log('👁️ View Once Message Detected!');
                
                // Extracting exact media type and message
                let mediaType = Object.keys(viewOnce)[0]; // 'imageMessage', 'videoMessage', 'audioMessage'
                let mediaMessage = viewOnce[mediaType];
                
                // Naya Download Tareeqa
                const stream = await downloadContentFromMessage(mediaMessage, mediaType.replace('Message', ''));
                let buffer = Buffer.from([]);
                for await(const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                
                await sock.sendMessage(sender, { text: "🚨 *View Once Unlocked by RSS BRAND* 🚨" }, { quoted: msg });
                
                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(sender, { image: buffer, caption: "📸 Saved View-Once Picture" });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(sender, { video: buffer, caption: "🎥 Saved View-Once Video" });
                } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(sender, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }); 
                }
            } catch (err) {
                console.log("Anti-View Once Error:", err);
                await sock.sendMessage(sender, { text: "❌ Error: View-Once save nahi ho saka." });
            }
            return; // Return zaroori hai taake AI text samajh kar error na de
        }

        // Ignore bot's own messages and status broadcasts
        if (msg.key.fromMe || sender === 'status@broadcast') return;

        // Text Extraction
        const text = (msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "").toLowerCase().trim();

        if (!text) return;

        // ---------------------------------------------------------
        // 2. STATUS DOWNLOADER COMMAND (.save)
        // ---------------------------------------------------------
        if (text === '.save' || text === 'save') {
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
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
                await sock.sendMessage(sender, { text: "⚠️ Kisi Status ya Media par reply karke *.save* likhein." });
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
                             `📝 *[Any text]* - AI se baat karein\n` +
                             `⬇️ *.save* - Kisi ke Status par reply karke save karein\n` +
                             `👁️ *Anti-View Once* - 1-time photos/voice auto-save hongi\n` +
                             `📋 *.menu* - Commands list dekhne ke liye\n\n` +
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
