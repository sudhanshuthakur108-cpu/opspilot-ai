// The provider used until a real model is connected. It makes no network call, runs no tools and
// generates no text; it only reports that no model is configured.
//
// Provider contract: `respond({ message, tools, runTool })` returns
// { status: 'completed', text } or { status: 'not_configured' }. `tools` are the allowlisted tool
// definitions and `runTool(name, input)` runs one of them for the caller's organization, which the
// server has already bound; a provider never sees or chooses the organization.
export const developmentProvider = Object.freeze({
  name: 'development',

  async respond() {
    return { status: 'not_configured' };
  },
});
