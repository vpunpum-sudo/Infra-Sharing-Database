function canAccessProjectFiles(user, project, write = false) {
  if (!user || !project || user.isApproved !== true) return false;
  const owners = Array.isArray(project.owners) && project.owners.length
    ? project.owners : [project.owner];
  const authorized = user.role === 'Admin' ||
    (user.owner && user.owner !== 'None' && owners.includes(user.owner));
  return !!authorized && (!write || user.role !== 'Viewer');
}

module.exports = { canAccessProjectFiles };
