from pathlib import Path

path = Path("artifacts/api-server/src/routes/webhooks.ts")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 match, encontrado {count}")
    text = text.replace(old, new, 1)


replace_once(
    '          let mensagem     = "";\n          let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";\n',
    '          let mensagem     = "";\n'
    '          let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";\n'
    '          let midiaUrl: string | null = null;\n'
    '          let midiaMimeType: string | null = null;\n'
    '          let midiaFileName: string | null = null;\n'
    '          let midiaSize: number | null = null;\n\n'
    '          async function salvarMetaMidia(buffer: Buffer, mimeType: string, fileName: string) {\n'
    '            const objectPath = await objectStorage.savePrivateBuffer(buffer, mimeType, fileName);\n'
    '            midiaUrl = `/api/storage${objectPath}`;\n'
    '            midiaMimeType = mimeType;\n'
    '            midiaFileName = fileName;\n'
    '            midiaSize = buffer.length;\n'
    '          }\n',
    "meta media state",
)

replace_once(
    '            const audioId = ((msg["audio"] ?? msg["voice"]) as Record<string, string>)?.id;\n'
    '            if (!audioId) continue;\n'
    '            try {\n'
    '              const buf = await downloadMetaMedia(audioId, whatsappConnection.metaAccessToken);\n'
    '              mensagem = await transcribeAudioBuffer(buf, tenantId, req.log);\n'
    '              tipoConteudo = "audio";\n'
    '              req.log.info({ audioId, chars: mensagem.length }, "meta-webhook: audio transcribed");\n',
    '            const audioData = ((msg["audio"] ?? msg["voice"]) as Record<string, string>) ?? {};\n'
    '            const audioId = audioData.id;\n'
    '            if (!audioId) continue;\n'
    '            try {\n'
    '              const buf = await downloadMetaMedia(audioId, whatsappConnection.metaAccessToken);\n'
    '              mensagem = await transcribeAudioBuffer(buf, tenantId, req.log);\n'
    '              tipoConteudo = "audio";\n'
    '              await salvarMetaMidia(buf, audioData.mime_type || "audio/ogg", "audio.ogg");\n'
    '              req.log.info({ audioId, chars: mensagem.length }, "meta-webhook: audio transcribed");\n',
    "meta audio persist",
)

replace_once(
    '              mensagem = await interpretImage(dataUrl, tenantId, caption, req.log);\n'
    '              tipoConteudo = "imagem";\n'
    '              req.log.info({ imageId, chars: mensagem.length }, "meta-webhook: image interpreted");\n',
    '              mensagem = await interpretImage(dataUrl, tenantId, caption, req.log);\n'
    '              tipoConteudo = "imagem";\n'
    '              await salvarMetaMidia(buf, mimeType, "foto.jpg");\n'
    '              req.log.info({ imageId, chars: mensagem.length }, "meta-webhook: image interpreted");\n',
    "meta image persist",
)

replace_once(
    '          } else {\n            req.log.info({ type: msgType, phone }, "meta-webhook: unsupported message type — skipping");\n            continue;\n          }\n\n          if (!mensagem.trim()) continue;\n\n          // Find or create lead (dedup by normalized phone)\n',
    '          } else if (msgType === "video") {\n'
    '            if (!whatsappConnection.metaAccessToken) {\n'
    '              req.log.warn({ phone }, "meta-webhook: video received but no access token — skipping");\n'
    '              continue;\n'
    '            }\n'
    '            const videoData = (msg["video"] as Record<string, string>) ?? {};\n'
    '            const videoId = videoData.id;\n'
    '            if (!videoId) continue;\n'
    '            try {\n'
    '              const buf = await downloadMetaMedia(videoId, whatsappConnection.metaAccessToken);\n'
    '              mensagem = videoData.caption?.trim() || "Vídeo enviado pelo WhatsApp";\n'
    '              tipoConteudo = "video";\n'
    '              await salvarMetaMidia(buf, videoData.mime_type || "video/mp4", "video.mp4");\n'
    '            } catch (err) {\n'
    '              req.log.error({ err, videoId }, "meta-webhook: video download failed — skipping");\n'
    '              continue;\n'
    '            }\n\n'
    '          } else if (msgType === "document") {\n'
    '            if (!whatsappConnection.metaAccessToken) {\n'
    '              req.log.warn({ phone }, "meta-webhook: document received but no access token — skipping");\n'
    '              continue;\n'
    '            }\n'
    '            const documentData = (msg["document"] as Record<string, string>) ?? {};\n'
    '            const documentId = documentData.id;\n'
    '            const fileName = documentData.filename || "documento";\n'
    '            const mimeType = documentData.mime_type || "application/octet-stream";\n'
    '            if (!documentId) continue;\n'
    '            try {\n'
    '              const buf = await downloadMetaMedia(documentId, whatsappConnection.metaAccessToken);\n'
    '              const supportedForText = mimeType.includes("pdf") || mimeType.includes("word") || /\\.(pdf|doc|docx)$/i.test(fileName);\n'
    '              mensagem = supportedForText\n'
    '                ? await interpretPdfBuffer(buf, fileName, req.log)\n'
    '                : (documentData.caption?.trim() || `Documento: ${fileName}`);\n'
    '              tipoConteudo = "documento";\n'
    '              await salvarMetaMidia(buf, mimeType, fileName);\n'
    '            } catch (err) {\n'
    '              req.log.error({ err, documentId }, "meta-webhook: document processing failed — skipping");\n'
    '              continue;\n'
    '            }\n\n'
    '          } else {\n'
    '            req.log.info({ type: msgType, phone }, "meta-webhook: unsupported message type — skipping");\n'
    '            continue;\n'
    '          }\n\n'
    '          if (!mensagem.trim()) continue;\n\n'
    '          const supportIngest = await tryIngestTechnicianSupportMessage({\n'
    '            tenantId,\n'
    '            phone,\n'
    '            text: mensagem,\n'
    '            mediaUrl: midiaUrl,\n'
    '            mediaType: tipoConteudo,\n'
    '            mimeType: midiaMimeType,\n'
    '            fileName: midiaFileName,\n'
    '            fileSize: midiaSize,\n'
    '            transcription: tipoConteudo === "audio" ? mensagem : null,\n'
    '            sourceMessageId: String(msg["id"] ?? "") || null,\n'
    '            provider: "meta",\n'
    '            log: req.log,\n'
    '          });\n'
    '          if (supportIngest.handled) {\n'
    '            req.log.info({ supportIngest, phone }, "meta-webhook: atualização de técnico absorvida pela assistência");\n'
    '            continue;\n'
    '          }\n\n'
    '          // Find or create lead (dedup by normalized phone)\n',
    "meta technician intercept",
)

replace_once(
    '            tipoConteudo,\n            status: "entregue",\n',
    '            tipoConteudo,\n            midiaUrl,\n            status: "entregue",\n',
    "meta message media url",
)

path.write_text(text, encoding="utf-8")
print("Meta support ingest patch applied")
