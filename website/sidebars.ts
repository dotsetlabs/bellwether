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
        'cli/test',
        'cli/baseline',
        'cli/init',
        'cli/discover',
        'cli/watch',
        'cli/auth',
        'cli/verify',
        'cli/badge',
        'cli/registry',
        {
          type: 'category',
          label: 'Cloud Commands',
          items: [
            'cli/login',
            'cli/link',
            'cli/projects',
            'cli/upload',
            'cli/history',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/personas',
        'concepts/workflows',
        'concepts/baselines',
        'concepts/drift-detection',
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
