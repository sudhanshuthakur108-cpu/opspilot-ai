import mongoose from 'mongoose';

export const EMAIL_MAX_LENGTH = 254;
// Deliberately loose: the only real test of an address is sending mail to it.
export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;

// Trims, joins runs of whitespace into single spaces and uses the composed Unicode form, so the
// same name is always stored the same way.
export function normalizeName(name) {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ');
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
    // The account holder's name, as they entered it. Required at registration (see
    // auth.validation.js), but not here: accounts created before names existed have none.
    name: { type: String, trim: true, minlength: NAME_MIN_LENGTH, maxlength: NAME_MAX_LENGTH },
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
