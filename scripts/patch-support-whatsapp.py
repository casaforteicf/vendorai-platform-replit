from pathlib import Path

path = Path("artifacts/api-server/src/routes/webhooks.ts")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 match, encontrado {count}")
    text = text.replace(old, new, 1)


# Shared technician-support interceptor.
replace_once(
    'import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";\n',
    'import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";\n'
    'import { tryIngestTechnicianSupportMessage } from "../services/support-whatsapp-ingest.js";\n',
    "import support ingest",
)

# Normalized webhook: internal user messages must never create a lead.
replace_once(
    '  const normalized = storePhone(telefone);\n  const match = await findLeadByDedup(tenantId, telefone, null, null);\n',
    '  const normalized = storePhone(telefone);\n'
    '  const supportIngest = await tryIngestTechnicianSupportMessage({\n'
    '    tenantId, phone: telefone, text: mensagem, mediaType: "texto", provider: "normalized", log: req.log,\n'
    '  });\n'
    '  if (supportIngest.handled) {\n'
    '    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });\n'
    '    return;\n'
    '  }\n'
    '  const match = await findLeadByDedup(tenantId, telefone, null, null);\n',
    "normalized technician intercept",
)

# Z-API supports video too; the ingest service persists the external media URL.
replace_once(
    '  let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";\n\n  if (payload.audio?.audioUrl) {',
    '  let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";\n\n  if (payload.audio?.audioUrl) {',
    "zapi media union",
)

replace_once(
    '  } else if (payload.text?.message || payload.body) {\n    // ── Text ─────────────────────────────────────────────────────────────────\n',
    '  } else if (payload.video?.videoUrl) {\n'
    '    // ── Video ────────────────────────────────────────────────────────────────\n'
    '    mensagem = payload.video.caption?.trim() || "Vídeo enviado pelo WhatsApp";\n'
    '    tipoConteudo = "video";\n\n'
    '  } else if (payload.text?.message || payload.body) {\n'
    '    // ── Text ─────────────────────────────────────────────────────────────────\n',
    "zapi video branch",
)

replace_once(
    '  const telefone = normalizeZapiPhone(payload.phone);\n  const nome = payload.chatName ?? payload.senderName ?? telefone;\n',
    '  const telefone = normalizeZapiPhone(payload.phone);\n'
    '  const zapiMediaUrl =\n'
    '    tipoConteudo === "audio" ? payload.audio?.audioUrl :\n'
    '    tipoConteudo === "imagem" ? payload.image?.imageUrl :\n'
    '    tipoConteudo === "video" ? payload.video?.videoUrl :\n'
    '    tipoConteudo === "documento" ? payload.document?.documentUrl : null;\n'
    '  const zapiMimeType =\n'
    '    tipoConteudo === "audio" ? payload.audio?.mimeType :\n'
    '    tipoConteudo === "imagem" ? payload.image?.mimeType :\n'
    '    tipoConteudo === "video" ? payload.video?.mimeType :\n'
    '    tipoConteudo === "documento" ? payload.document?.mimeType : null;\n'
    '  const zapiFileName =\n'
    '    tipoConteudo === "audio" ? "audio.ogg" :\n'
    '    tipoConteudo === "imagem" ? "foto.jpg" :\n'
    '    tipoConteudo === "video" ? "video.mp4" :\n'
    '    tipoConteudo === "documento" ? (payload.document?.fileName ?? "documento") : null;\n'
    '  const supportIngest = await tryIngestTechnicianSupportMessage({\n'
    '    tenantId,\n'
    '    phone: telefone,\n'
    '    text: mensagem,\n'
    '    mediaUrl: zapiMediaUrl,\n'
    '    mediaType: tipoConteudo,\n'
    '    mimeType: zapiMimeType,\n'
    '    fileName: zapiFileName,\n'
    '    transcription: tipoConteudo === "audio" ? mensagem : null,\n'
    '    provider: "zapi",\n'
    '    log: req.log,\n'
    '  });\n'
    '  if (supportIngest.handled) {\n'
    '    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });\n'
    '    return;\n'
    '  }\n'
    '  const nome = payload.chatName ?? payload.senderName ?? telefone;\n',
    "zapi technician intercept",
)

# Evolution: add durable video handling using the same private storage path.
replace_once(
    '  let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";\n  let midiaUrl: string | null = null;\n',
    '  let tipoConteudo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";\n  let midiaUrl: string | null = null;\n',
    "evolution media union",
)

replace_once(
    '  } else if (msg["documentMessage"]) {\n    const messageId = key.id;\n',
    '  } else if (msg["videoMessage"]) {\n'
    '    const messageId = key.id;\n'
    '    if (!messageId) {\n'
    '      res.status(200).json({ ignored: true, reason: "video_no_message_id" });\n'
    '      return;\n'
    '    }\n'
    '    const videoMsg = msg["videoMessage"] as { caption?: string; mimetype?: string };\n'
    '    try {\n'
    '      const media = await getBase64FromMediaMessage(tenantId, messageId);\n'
    '      if (!media.base64) throw new Error("base64 vazio retornado pela Evolution API");\n'
    '      const buffer = Buffer.from(media.base64, "base64");\n'
    '      mensagem = videoMsg?.caption?.trim() || "Vídeo enviado pelo WhatsApp";\n'
    '      tipoConteudo = "video";\n'
    '      midiaUrl = await salvarMidiaOriginal(buffer, media.mimetype ?? videoMsg?.mimetype ?? "video/mp4", "video.mp4");\n'
    '    } catch (err) {\n'
    '      req.log.error({ err, tenantId, remoteJid }, "evolution-webhook: falha ao processar vídeo");\n'
    '      res.status(200).json({ ignored: true, reason: "video_processing_failed" });\n'
    '      return;\n'
    '    }\n'
    '  } else if (msg["documentMessage"]) {\n'
    '    const messageId = key.id;\n',
    "evolution video branch",
)

replace_once(
    '  const telefone = remoteJid.replace(/@.*$/, "").replace(/\\D/g, "");\n  const nome = (data as { pushName?: string }).pushName ?? telefone;\n',
    '  const telefone = remoteJid.replace(/@.*$/, "").replace(/\\D/g, "");\n'
    '  const evolutionFileName =\n'
    '    tipoConteudo === "audio" ? "audio.ogg" :\n'
    '    tipoConteudo === "imagem" ? "foto.jpg" :\n'
    '    tipoConteudo === "video" ? "video.mp4" :\n'
    '    tipoConteudo === "documento" ? ((msg["documentMessage"] as { fileName?: string } | undefined)?.fileName ?? "documento") : null;\n'
    '  const evolutionMimeType =\n'
    '    tipoConteudo === "audio" ? "audio/ogg" :\n'
    '    tipoConteudo === "imagem" ? "image/jpeg" :\n'
    '    tipoConteudo === "video" ? "video/mp4" :\n'
    '    tipoConteudo === "documento" ? ((msg["documentMessage"] as { mimetype?: string } | undefined)?.mimetype ?? "application/octet-stream") : null;\n'
    '  const supportIngest = await tryIngestTechnicianSupportMessage({\n'
    '    tenantId,\n'
    '    phone: telefone,\n'
    '    text: mensagem,\n'
    '    mediaUrl: midiaUrl,\n'
    '    mediaType: tipoConteudo,\n'
    '    mimeType: evolutionMimeType,\n'
    '    fileName: evolutionFileName,\n'
    '    transcription: tipoConteudo === "audio" ? mensagem : null,\n'
    '    sourceMessageId: key.id ?? null,\n'
    '    provider: "evolution",\n'
    '    log: req.log,\n'
    '  });\n'
    '  if (supportIngest.handled) {\n'
    '    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });\n'
    '    return;\n'
    '  }\n'
    '  const nome = (data as { pushName?: string }).pushName ?? telefone;\n',
    "evolution technician intercept",
)

path.write_text(text, encoding="utf-8")
print("support WhatsApp patch applied")
