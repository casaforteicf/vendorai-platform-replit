from pathlib import Path
config=Path('artifacts/frontend/src/pages/Configuracoes.tsx').read_text()
start=config.find('// ── Proposal Template Section')
needles=[
  '// ── Contract Template Section',
  'const CONTRACT_VARIABLES = [',
  'function ContractTemplateSection',
  'function ContractSettingsSection',
  'function ProposalTemplateSection',
  '// ── Main Page',
]
lines=[f'start={start}']
for n in needles:
    allpos=[]
    p=0
    while True:
        i=config.find(n,p)
        if i<0: break
        allpos.append(i); p=i+1
    lines.append(f'{n}={allpos}')
if start>=0:
    lines.append('after_start='+config[start:start+12000].replace('\n','\\n')[-3000:])
Path('debug-orcamento-anchors.txt').write_text('\n'.join(lines)+'\n')
