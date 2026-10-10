/** Pure, fail-closed policy for the existing Browser MCP. No side effects. */
export function decideBrowserAutonomy({globalEnabled=false,tenantEnabled=false,mode="assistido",allowWrite=false}={}) {
 const permitted=globalEnabled===true && tenantEnabled===true;
 const autonomous=permitted && mode==="autonomo";
 return Object.freeze({mode:autonomous?"autonomo":"assistido",allowWrite:autonomous && allowWrite===true});
}
