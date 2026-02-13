import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

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
        {
          type: 'category',
          label: 'Core',
          collapsed: false,
          items: ['cli/init', 'cli/check', 'cli/baseline'],
        },
        {
          type: 'category',
          label: 'Advanced',
          collapsed: false,
          items: [
            'cli/explore',
            'cli/watch',
            'cli/discover',
            'cli/golden',
            'cli/contract',
            'cli/registry',
            'cli/auth',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/core-vs-advanced',
        'concepts/test-modes',
        'concepts/baselines',
        'concepts/drift-detection',
        'concepts/personas',
        'concepts/workflows',
        'concepts/output-formats',
        'concepts/positioning',
        'concepts/compatibility-policy',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/local-development',
        'guides/ci-cd',
        'guides/golden-paths',
        'guides/configuration',
        'guides/github-gitlab',
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
