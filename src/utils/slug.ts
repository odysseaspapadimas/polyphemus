import slugify from "slugify";

export default function slug(string: string | undefined | null) {
  if (!string) return "";
  return slugify(string, { lower: true, strict: true });
}
