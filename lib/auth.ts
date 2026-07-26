export async function signUp(
  name: string,
  email: string,
  password: string
) {
  try {
    const response = await fetch(
      "/api/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          fullName: name,
          email,
          password,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          data.error ||
            "Registration failed."
        ),
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error
          : new Error(
              "Registration failed."
            ),
    };
  }
}

export async function signIn(
  email: string,
  password: string
) {
  try {
    const response = await fetch(
      "/api/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          data.error ||
            "Login failed."
        ),
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error
          : new Error(
              "Login failed."
            ),
    };
  }
}

export async function signOut() {
  try {
    const response = await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: new Error(
          data.error ||
            "Logout failed."
        ),
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error
          : new Error(
              "Logout failed."
            ),
    };
  }
}

export async function getCurrentUser() {
  try {
    const response = await fetch(
      "/api/auth/me",
      {
        method: "GET",
        cache: "no-store",
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      return null;
    }

    return data.user || null;
  } catch {
    return null;
  }
}