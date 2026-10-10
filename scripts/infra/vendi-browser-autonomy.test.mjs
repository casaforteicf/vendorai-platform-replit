import test from "node:test";
import assert from "node:assert/strict";
import {decideBrowserAutonomy as decide} from "../../artifacts/api-server/src/lib/browser-autonomy.ts";
test("global kill switch overrides client write/autonomous requests",()=>{
 assert.deepEqual(decide({globalEnabled:false,tenantEnabled:true,mode:"autonomo",allowWrite:true}),{mode:"assistido",allowWrite:false});
});
test("tenant opt-in required even when global is on",()=>{
 assert.deepEqual(decide({globalEnabled:true,tenantEnabled:false,mode:"autonomo",allowWrite:true}),{mode:"assistido",allowWrite:false});
});
test("both permissions still default to no autonomous execution",()=>{
 assert.deepEqual(decide({globalEnabled:true,tenantEnabled:true,allowWrite:true}),{mode:"assistido",allowWrite:false});
});
test("explicit autonomous request can remain read-only",()=>{
 assert.deepEqual(decide({globalEnabled:true,tenantEnabled:true,mode:"autonomo",allowWrite:false}),{mode:"autonomo",allowWrite:false});
});
test("write requires all three approvals",()=>{
 assert.deepEqual(decide({globalEnabled:true,tenantEnabled:true,mode:"autonomo",allowWrite:true}),{mode:"autonomo",allowWrite:true});
});
test("undefined, malformed and string toggles cannot enable write",()=>{
 assert.deepEqual(decide(),{mode:"assistido",allowWrite:false});
 assert.deepEqual(decide({globalEnabled:"true",tenantEnabled:true,mode:"autonomo",allowWrite:true}),{mode:"assistido",allowWrite:false});
});
