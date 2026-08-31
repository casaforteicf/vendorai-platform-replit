import { NextResponse } from 'next/server';
import { storageMode } from '../../../lib/store';
export async function GET(){return NextResponse.json({ok:true,service:'tad-vendorai',version:'0.20.0',mode:'PAPER',liveTrading:false,storage:storageMode(),ts:Date.now()})}
