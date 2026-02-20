const isPrivateIpv4 = (hostname) => {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((p) => p === '' || Number.isNaN(Number(p)))) {
    return false;
  }

  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

const isAllowedOrigin = (origin, allowedOrigins = [], nodeEnv = 'development') => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.toLowerCase();
  const allowed = new Set((allowedOrigins || []).map((o) => o.toLowerCase()));
  if (allowed.has(normalizedOrigin)) {
    return true;
  }

  if (nodeEnv !== 'development') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      return true;
    }

    if (isPrivateIpv4(hostname)) {
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
};

module.exports = {
  isAllowedOrigin,
};
