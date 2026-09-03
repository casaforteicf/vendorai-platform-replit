import { NextRequest, NextResponse } from 'next/server';
import { closePaperPosition, comparePaperShadow, markPaperPosition, summarizePortfolio } from '@tad/core';
import { loadMarkets } from '../../../lib/binance';
import { bearerToken } from '../../../lib/auth';
import { appendAudit, findShadowByPaperPosition, getPaperWallet, listPositions, savePosition, storageMode, updateShadowExecution } from '../../../lib/store';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  try{
    const [positions,markets,wallet]=await Promise.all([listPositions(token),loadMarkets(),getPaperWallet(token)]); const mm=new Map(markets.map(m=>[m.symbol,m.price]));
    const reconciled=[];
    for(const p of positions){
      const price=mm.get(p.symbol)??p.markPrice;
      const next=markPaperPosition(p,price);
      const managed=next.quantity!==p.quantity||next.stop!==p.stop||next.realizedPnl!==p.realizedPnl;
      if(next.updatedAt!==p.updatedAt||next.status!==p.status){
        await savePosition(token,next);
        if(next.status==='CLOSED'&&p.status==='OPEN'){
          const sh=await findShadowByPaperPosition(token,p.id);
          if(sh){const cmp=comparePaperShadow(sh,next.markPrice,next.markPrice);await updateShadowExecution(token,sh.id,{paperExit:cmp.paperExit,shadowExit:cmp.shadowExit,paperReturnPct:cmp.paperReturnPct,shadowReturnPct:cmp.shadowReturnPct,divergencePct:cmp.divergencePct,closedAt:Date.now()});}
          await appendAudit(token,'PAPER_AUTO_CLOSE',{position:next,shadowCompared:Boolean(sh),closeReason:next.closeReason});
        }else if(managed){
          await appendAudit(token,'PAPER_POSITION_MANAGED',{positionId:p.id,symbol:p.symbol,strategyId:p.strategyId,side:p.side,from:{quantity:p.quantity,stop:p.stop,realizedPnl:p.realizedPnl},to:{quantity:next.quantity,stop:next.stop,realizedPnl:next.realizedPnl},partialExit:next.quantity<p.quantity,breakEvenActivated:next.stop===next.entry&&p.stop!==p.entry,trailingAdjusted:next.stop!==p.stop&&next.stop!==next.entry,markPrice:next.markPrice});
        }
      }
      reconciled.push(next);
    }
    return NextResponse.json({mode:'PAPER',storage:storageMode(),positions:reconciled,summary:summarizePortfolio(reconciled,wallet.depositedCapital),wallet});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'PORTFOLIO_ERROR'},{status:500})}
}

export async function PATCH(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const body=await req.json() as {id?:string;markPrice?:number}; if(!body.id)return NextResponse.json({error:'POSITION_ID_REQUIRED'},{status:400});
  const positions=await listPositions(token); const p=positions.find(x=>x.id===body.id); if(!p)return NextResponse.json({error:'POSITION_NOT_FOUND'},{status:404});
  if(p.status==='CLOSED')return NextResponse.json({position:p}); const price=body.markPrice??p.markPrice; const next=closePaperPosition(p,price,'MANUAL'); await savePosition(token,next); const sh=await findShadowByPaperPosition(token,p.id); let shadowComparison=null;if(sh){shadowComparison=comparePaperShadow(sh,next.markPrice,next.markPrice);await updateShadowExecution(token,sh.id,{paperExit:shadowComparison.paperExit,shadowExit:shadowComparison.shadowExit,paperReturnPct:shadowComparison.paperReturnPct,shadowReturnPct:shadowComparison.shadowReturnPct,divergencePct:shadowComparison.divergencePct,closedAt:Date.now()});} await appendAudit(token,'PAPER_MANUAL_CLOSE',{position:next,shadowComparison}); return NextResponse.json({position:next,shadowComparison});
}
