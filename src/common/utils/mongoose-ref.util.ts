/**
 * User/org/profile refs may be a raw ObjectId or a populated Mongoose subdocument.
 * Always extract the underlying id string for queries and JWT claims.
 */
export function mongooseRefId(ref: unknown): string | undefined {
  if (ref == null) {
    return undefined;
  }
  if (typeof ref === 'object' && '_id' in (ref as object)) {
    const id = (ref as { _id: unknown })._id;
    if (id != null) {
      return String(id);
    }
  }
  return String(ref);
}
