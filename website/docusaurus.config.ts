import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Bellwether',
  tagline: 'Deterministic MCP drift detection for CI',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.bellwether.sh',
  baseUrl: '/',

  organizationName: 'dotsetlabs',
  projectName: 'bellwether',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/dotsetlabs/bellwether/tree/main/website/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/bellwether-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Bellwether',
      logo: {
        alt: 'Bellwether Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/dotsetlabs/bellwether',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/',
            },
            {
              label: 'CLI Reference',
              to: '/cli/check',
            },
            {
              label: 'CI/CD Integration',
              to: '/guides/ci-cd',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'Changelog',
              href: 'https://github.com/dotsetlabs/bellwether/blob/main/CHANGELOG.md',
            },
            {
              label: 'Roadmap',
              href: 'https://github.com/dotsetlabs/bellwether/blob/main/ROADMAP.md',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/dotsetlabs/bellwether',
            },
            {
              label: 'Issues',
              href: 'https://github.com/dotsetlabs/bellwether/issues',
            },
            {
              label: 'Discussions',
              href: 'https://github.com/dotsetlabs/bellwether/discussions',
            },
          ],
        },
        {
          title: 'Dotset Labs',
          items: [
            {
              label: 'Website',
              href: 'https://dotsetlabs.com',
            },
            {
              label: 'Hardpoint',
              href: 'https://github.com/dotsetlabs/hardpoint',
            },
            {
              label: 'Overwatch',
              href: 'https://github.com/dotsetlabs/overwatch',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Dotset Labs LLC. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json'],
    },
    algolia: undefined, // Can be added later for search
  } satisfies Preset.ThemeConfig,
};

export default config;
