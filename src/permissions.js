export const PERMISSIONS = Object.freeze({
  TRIP_VIEW: "TRIP_VIEW",
  TRIP_EDIT: "TRIP_EDIT",
  TRIP_DELETE: "TRIP_DELETE",
  TRIP_DUPLICATE: "TRIP_DUPLICATE",
  MEMBER_INVITE: "MEMBER_INVITE",
  MEMBER_REMOVE: "MEMBER_REMOVE",
  MEMBER_CHANGE_ROLE: "MEMBER_CHANGE_ROLE",
  OWNER_TRANSFER: "OWNER_TRANSFER",
  BUDGET_EDIT: "BUDGET_EDIT",
  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
});

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(Object.values(PERMISSIONS)),
  editor: Object.freeze([
    PERMISSIONS.TRIP_VIEW,
    PERMISSIONS.TRIP_EDIT,
    PERMISSIONS.TRIP_DUPLICATE,
    PERMISSIONS.BUDGET_EDIT,
    PERMISSIONS.DOCUMENT_UPLOAD,
  ]),
  viewer: Object.freeze([PERMISSIONS.TRIP_VIEW]),
});

export const ROLE_LABELS = Object.freeze({ owner: "Owner", editor: "Editor", viewer: "Viewer" });

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function roleCan(role, permission) {
  return permissionsForRole(role).includes(permission);
}
