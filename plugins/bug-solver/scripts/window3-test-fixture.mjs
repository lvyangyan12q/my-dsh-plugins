export const sshConfigJson = JSON.stringify({
  connections: [{
    id: 'connection-test',
    name: 'Test server',
    host: '192.0.2.10',
    port: 22,
    user: 'test-user',
    key: 'C:\\test-keys\\id_ed25519',
    isDefault: true,
  }],
  projects: [{
    id: 'project-test',
    name: 'Example project',
    localPath: '',
    remotePath: '/srv/example-app',
    defaultBranch: 'main',
  }],
})
