import mongoose from 'mongoose';

export const NAME_MAX_LENGTH = 100;
export const SLUG_MAX_LENGTH = 60;
// Lowercase words separated by single hyphens, e.g. "acme-logistics".
export const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: SLUG_MAX_LENGTH,
      match: SLUG_FORMAT,
    },
  },
  { timestamps: true },
);

organizationSchema.index({ slug: 1 }, { unique: true });

export const Organization = mongoose.model('Organization', organizationSchema);
