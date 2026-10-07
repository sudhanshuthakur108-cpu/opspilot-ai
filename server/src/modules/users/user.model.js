import mongoose from 'mongoose';

export const EMAIL_MAX_LENGTH = 254;
// Deliberately loose: the only real test of an address is sending mail to it.
export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
      match: EMAIL_FORMAT,
    },
    // Argon2id hash in PHC string format. Left out of query results unless explicitly selected.
    passwordHash: { type: String, required: true, select: false },
    // Copied into every session token; incrementing it invalidates all of the user's sessions.
    tokenVersion: { type: Number, required: true, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
