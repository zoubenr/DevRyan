export function registerQuotaRoutes(app, { getQuotaProviders, resolveProjectDirectory }) {
  const resolveQuotaDirectory = async (req) => {
    const headerDirectory = typeof req.get === 'function' ? req.get('x-opencode-directory') : null;
    const queryDirectory = Array.isArray(req.query?.directory)
      ? req.query.directory[0]
      : req.query?.directory;
    const requestedDirectory = headerDirectory || queryDirectory || null;

    if (!requestedDirectory) {
      return null;
    }

    if (typeof resolveProjectDirectory !== 'function') {
      return requestedDirectory;
    }

    const resolved = await resolveProjectDirectory(req);
    if (!resolved.directory) {
      const error = new Error(resolved.error || 'Invalid working directory');
      error.statusCode = 400;
      throw error;
    }
    return resolved.directory;
  };

  app.get('/api/quota/providers', async (req, res) => {
    try {
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      const workingDirectory = await resolveQuotaDirectory(req);
      const providers = listConfiguredQuotaProviders({ workingDirectory });
      res.json({ providers });
    } catch (error) {
      console.error('Failed to list quota providers:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to list quota providers' });
    }
  });

  app.get('/api/quota/:providerId', async (req, res) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        return res.status(400).json({ error: 'Provider ID is required' });
      }
      const { fetchQuotaForProvider } = await getQuotaProviders();
      const forceRefresh = req.query.refresh === 'true';
      const workingDirectory = await resolveQuotaDirectory(req);
      const result = await fetchQuotaForProvider(providerId, { forceRefresh, workingDirectory });
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch quota:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch quota' });
    }
  });
}
