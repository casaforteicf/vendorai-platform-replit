import { NextResponse } from 'next/server';
import { storageMode } from '../../../lib/store';
export async function GET(){return NextResponse.json({ok:true,service:'tad-vendorai',version:'0.21.0',mode:'PAPER',liveTrading:false,auth:'PASSWORD_MAGIC_LINK_RLS',storage:storageMode(),ts:Date.now()})}
