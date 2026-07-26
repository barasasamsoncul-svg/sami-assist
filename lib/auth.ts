export async function signUp(
  name: string,
  email: string,
  password: string
) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName: name,
      email,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: data.error || "Registration failed.",
      },
    };
  }

  return {
    data,
    error: null,
  };
}

export async function signIn(
  email: string,
  password: string
) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: data.error || "Login failed.",
      },
    };
  }

  return {
    data,
    error: null,
  };
}

export async function signOut() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: data.error || "Logout failed.",
      },
    };
  }

  return {
    data,
    error: null,
  };
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  return data.user || null;
}