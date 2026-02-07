export {
  MCP_PROTOCOL_VERSIONS,
  type MCPProtocolVersion,
  type MCPFeatureFlags,
  isKnownProtocolVersion,
  getFeatureFlags,
  getSharedFeatureFlags,
  getFeatureIntroducedVersion,
  getExcludedFeatureNames,
} from './version-registry.js';
