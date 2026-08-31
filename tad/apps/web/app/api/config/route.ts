import { NextResponse } from 'next/server';
import { storageMode } from '../../../lib/store';
export async function GET(){return NextResponse.json({version:'0.16.0',mode:'PAPER',liveTrading:false,storage:storageMode(),websocket:'wss://fstream.binance.com/public/stream',domain:'tad.vendorai.com'})}
