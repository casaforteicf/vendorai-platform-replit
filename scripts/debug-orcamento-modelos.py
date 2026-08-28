from pathlib import Path

checks=[]
config=Path('artifacts/frontend/src/pages/Configuracoes.tsx').read_text()
backend=Path('artifacts/api-server/src/routes/lead_proposals.ts').read_text()
lead=Path('artifacts/frontend/src/pages/LeadPropostaTab.tsx').read_text()
checks.append(('config_start','// ── Proposal Template Section ──────────────────────────────────────────────────\n' in config))
checks.append(('config_end','// ── Contract Template Section ─────────────────────────────────────────────────\n' in config))
checks.append(('config_call','<ProposalTemplateSection\n              profileId={profileQuery.data.id}' in config))
checks.append(('backend_select','proposalTemplateUrl: businessProfilesTable.proposalTemplateUrl,\n      logoUrl: businessProfilesTable.logoUrl,' in backend))
checks.append(('backend_return','proposalTemplateUrl: bp?.proposalTemplateUrl ?? null,\n  };' in backend))
checks.append(('guidance_start','/** Fetch template content from object storage for AI guidance' in backend))
checks.append(('guidance_end','/** Resolve object-storage relative paths' in backend))
checks.append(('prompt_line','templateGuidance: await fetchTemplateGuidance(ctx.proposalTemplateUrl),' in backend))
checks.append(('lead_profile','const hasProposalTemplate = !!(profileQuery.data as any)?.proposalTemplateUrl;' in lead))
checks.append(('lead_body','propostaId: selectedOrcamentoId !== "__none__" ? selectedOrcamentoId : undefined,' in lead))
checks.append(('lead_header','{/* Template de proposta */}' in lead))
Path('debug-orcamento-anchors.txt').write_text('\n'.join(f'{k}={v}' for k,v in checks)+'\n')
