import { NextRequest, NextResponse } from 'next/server';
import { POST as autopaperScan } from '../../autopaper/scan/route';
import { runWithServiceUser, serviceRoleKey } from '../../../../lib/service-scope';

export const dynamic='force-dynamic';
export const maxDuration=300;

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryijsscpnicjuchqvcqa.supabase.co';

type ActiveUser={user_id:string};

async function activeAutopilotUsers(serviceRole:string):Promise<ActiveUser[]>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_autopilot_state?select=user_id&enabled=eq.true`,{
    headers:{apikey:serviceRole,Authorization:`Bearer ${serviceRole}`},cache:'no-store'
  });
  if(!r.ok)throw new Error(`AUTOPILOT_USERS_${r.status}`);
  return await r.json();
}

export async function GET(req:NextRequest){
  const cronSecret=process.env.CRON_SECRET || '';
  if(!cronSecret)return NextResponse.json({ok:false,error:'CRON_SECRET_NOT_CONFIGURED',liveExecution:false},{status:503});
  if(req.headers.get('authorization')!==`Bearer ${cronSecret}`)return NextResponse.json({ok:false,error:'CRON_UNAUTHORIZED',liveExecution:false},{status:401});

  const serviceRole=serviceRoleKey();
  if(!serviceRole)return NextResponse.json({ok:false,error:'SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED',liveExecution:false},{status:503});

  const users=await activeAutopilotUsers(serviceRole);
  const executions=[] as any[];
  for(const user of users){
    try{
      const result=await runWithServiceUser(user.user_id,async()=>{
        const internal=new NextRequest('http://tad.internal/api/autopaper/scan',{
          method:'POST',headers:{authorization:`Bearer ${serviceRole}`}
        });
        const response=await autopaperScan(internal);
        return {status:response.status,body:await response.json()};
      });
      executions.push({userId:user.user_id,status:result.status,cycleId:result.body?.cycleId??null,cycleStatus:result.body?.status??null,selected:result.body?.selected?.length??0,executions:result.body?.executions?.length??0});
    }catch(error){
      executions.push({userId:user.user_id,status:500,error:error instanceof Error?error.message:'CRON_USER_FAILED'});
    }
  }

  return NextResponse.json({ok:true,mode:'PAPER_AUTOPILOT_CRON',activeUsers:users.length,executions,liveExecution:false,exchangeOrderSent:false});
}
