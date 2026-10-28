import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseBinding, callReleaseOperator, hostReceipt, requireHomologated, requirePublished} from '../../artifacts/api-server/src/lib/vendi-release-operator.ts';

const sha='a'.repeat(40), id='sha256:'+'b'.repeat(64), lot='VENDI-3657';
const receipt=()=>({lot,sha,build:{SHA:sha,STATUS:'BUILT_NOT_DEPLOYED',IMAGE:'candidate',IMAGE_ID:id},homolog:{LOT:lot,SHA:sha,STATUS:'HOMOLOGATED',MODE:'ISOLATED_READONLY',AT_EPOCH:String(Math.floor(Date.now()/1000)),IMAGE:'candidate',IMAGE_ID:id},production:{SHA:sha,STATUS:'PUBLISHED',IMAGE_ID:id},activeImageId:id});

test('administrative binding pins an existing lot and exact SHA',()=>{
  assert.equal(releaseBinding('release',sha,JSON.stringify({release:{lot,sha}})),lot);
  for(const policy of [undefined,'null','{}','[]',JSON.stringify({release:{lot,sha:'c'.repeat(40)}})]) {
    assert.throws(()=>releaseBinding('release',sha,policy),/VENDI_RELEASE_BINDING/);
  }
});
test('host receipt rejects ambiguous, stale, wrong-SHA and wrong-digest evidence',()=>{
  const value=receipt(); const line='RELEASE_RECEIPT_JSON='+JSON.stringify(value);
  assert.deepEqual(hostReceipt(line,lot,sha),value);
  assert.throws(()=>hostReceipt(line+'\n'+line,lot,sha),/RECEIPT_REQUIRED/);
  assert.throws(()=>hostReceipt(line,lot,'c'.repeat(40)),/RECEIPT_MISMATCH/);
  requireHomologated(value); requirePublished(value);
  value.homolog.AT_EPOCH='1'; assert.throws(()=>requireHomologated(value),/NOT_VERIFIED/);
  value.activeImageId='wrong'; assert.throws(()=>requirePublished(value),/NOT_VERIFIED/);
});
test('MCP bridge calls only the fixed tool with scoped scalar arguments',async()=>{
  let invoked=false;
  const fetcher=async(url,init)=>{
    invoked=true; assert.equal(url.href,'https://operator.example/mcp');
    assert.equal(init.redirect,'error');
    assert.deepEqual(JSON.parse(init.body).params,{name:'vendi_contabo_operate',arguments:{action:'releaseStatus',lot}});
    return new Response(JSON.stringify({id:1,result:{content:[{type:'text',text:JSON.stringify({action:'releaseStatus',lot,output:'receipt'})}]}}));
  };
  assert.equal(await callReleaseOperator('releaseStatus',lot,{url:'https://operator.example/mcp',token:'synthetic',fetcher}),'receipt');
  assert.ok(invoked);
  await assert.rejects(callReleaseOperator('publish',lot,{url:'http://operator.example/mcp',token:'synthetic',fetcher}),/URL_INVALID/);
});
test('MCP denial or mismatched action is never a successful publication',async()=>{
  for(const message of [{id:1,result:{isError:true}}, {id:1,result:{content:[{type:'text',text:JSON.stringify({action:'rollback',lot,output:'ok'})}]}}]) {
    await assert.rejects(callReleaseOperator('publish',lot,{url:'https://operator.example/mcp',token:'synthetic',fetcher:async()=>new Response(JSON.stringify(message))}),/VENDI_RELEASE_MCP/);
  }
});

test('direct release requires fresh tests of the exact digest without mandatory homologation', async()=>{
  const {requireTested}=await import('../../artifacts/api-server/src/lib/vendi-release-operator.ts');
  const value=receipt(); value.homolog={};
  value.tests={LOT:lot,SHA:sha,IMAGE_ID:id,STATUS:'PASSED',SUITE:'api,mcp,operator,rollback,migrations',AT_EPOCH:String(Math.floor(Date.now()/1000))};
  requireTested(value);
  value.tests.IMAGE_ID='wrong'; assert.throws(()=>requireTested(value),/TESTS_NOT_VERIFIED/);
  value.tests.IMAGE_ID=id; value.tests.AT_EPOCH='1'; assert.throws(()=>requireTested(value),/TESTS_NOT_VERIFIED/);
});
