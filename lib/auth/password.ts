import * as bcrypt from 'bcryptjs';

const PASSWORD_HASH_ROUNDS = 12;

export async function hashPassword(
  password: string
): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error(
      'Password must be at least 8 characters.'
    );
  }

  return bcrypt.hash(
    password,
    PASSWORD_HASH_ROUNDS
  );
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  if (!password || !passwordHash) {
    return false;
  }

  try {
    return await bcrypt.compare(
      password,
      passwordHash
    );
  } catch (error) {
    console.error(
      '[Auth] Password verification failed:',
      error
    );

    return false;
  }
}