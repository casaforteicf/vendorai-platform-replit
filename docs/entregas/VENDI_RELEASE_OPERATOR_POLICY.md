# Vendi release operator policy

The MCP tool `vendi_contabo_operate` accepts fixed actions only. `releaseStatus` is read-only. All other actions (`build`, `homologate`, `rollback`, `preflight`, `publish`) now require an explicit operator grant before SSH is invoked.

Configure `VENDI_RELEASE_OPERATOR_POLICY` on the MCP service with the same verified OAuth client identifier used by the operator authentication layer. Store the JSON as a protected service secret; never commit real client IDs, access tokens, SSH material, or production credentials.

Example shape only:

```json
{
  "<verified-oauth-client-id>": {
    "lots": ["VENDI-05"],
    "actions": ["build", "homologate", "preflight"]
  }
}
```

A missing policy, missing OAuth operator identity, malformed JSON, unlisted action, or unlisted lot is denied. Grant only the actions needed for a specific operator and lot. Do not add `publish` or `rollback` until the corresponding release gates and host policy have been validated.

This change does not apply or alter the Contabo configuration. After review and merge, configure the policy through the existing secret-management procedure, then verify allowed and denied calls in isolated homologation before enabling release actions.
