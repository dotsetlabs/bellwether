import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Introduction',
    },
    {
      type: 'doc',
      id: 'installation',
      label: 'Installation',
    },
    {
      type: 'doc',
      id: 'quickstart',
      label: 'Quick Start',
    },
    {
      type: 'category',
      label: 'CLI Reference',
      collapsed: false,
      items: [
        'cli/init',
        'cli/check',
        'cli/explore',
        'cli/baseline',
        'cli/watch',
        'cli/discover',
        'cli/verify',
        'cli/auth',
        'cli/registry',
      ],
    },
    {
      type: 'category',
      label: 'Cloud',
      collapsed: false,
      link: {
        type: 'doc',
        id: 'cloud/index',
      },
      items: [
        'cloud/login',
        'cloud/teams',
        'cloud/link',
        'cloud/projects',
        'cloud/upload',
        'cloud/history',
        'cloud/badge',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/test-modes',
        'concepts/baselines',
        'concepts/drift-detection',
        'concepts/personas',
        'concepts/workflows',
        'concepts/output-formats',
        'concepts/positioning',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/local-development',
        'guides/ci-cd',
        'guides/configuration',
        'guides/cloud-integration',
        'guides/github-gitlab',
        'guides/webhooks',
        'guides/notifications',
        'guides/custom-personas',
        'guides/custom-scenarios',
        'guides/remote-servers',
        'guides/workflow-authoring',
      ],
    },
    {
      type: 'doc',
      id: 'faq',
      label: 'FAQ',
    },
    {
      type: 'doc',
      id: 'troubleshooting',
      label: 'Troubleshooting',
    },
  ],
};

export default sidebars;
