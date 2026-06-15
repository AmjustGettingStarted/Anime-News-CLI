#!/usr/bin/env node

import Parser from 'rss-parser';
import chalk from 'chalk';
import boxen from 'boxen';
import prompts from 'prompts';
import ora from 'ora';
import open from 'open';
import minimist from 'minimist';

const parser = new Parser();

// Helper to format publication date to a relative string (e.g. 5h ago)
function formatRelativeTime(dateStr) {
  try {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch (e) {
    return dateStr;
  }
}

// Helper to separate article title from source (Google News format: "Title - Source")
function parseTitleAndSource(rawTitle) {
  const parts = rawTitle.split(' - ');
  if (parts.length > 1) {
    const source = parts.pop();
    const title = parts.join(' - ');
    return { title, source };
  }
  return { title: rawTitle, source: 'Google News' };
}

// Fetch news feed from Google News RSS
async function fetchNews(query) {
  // Ensure the query focuses on anime if it doesn't already contain it
  let finalQuery = query;
  const lowerQuery = query.toLowerCase();
  if (lowerQuery !== 'anime' && !lowerQuery.includes('anime')) {
    finalQuery = `anime ${query}`;
  }

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(finalQuery)}&hl=en-US&gl=US&ceid=US:en`;
  const feed = await parser.parseURL(url);
  return feed.items || [];
}

// Display help instructions
function showHelp() {
  console.log(boxen(
    `${chalk.bold.yellow('Anime News CLI')} 🌟\n\n` +
    `Get the latest anime news right in your terminal using Google News RSS.\n\n` +
    `${chalk.bold('Usage:')}\n` +
    `  anime-news [options]\n\n` +
    `${chalk.bold('Options:')}\n` +
    `  -s, --search <query>  Search for specific anime/topics (default: "anime")\n` +
    `  -l, --limit <number>  Limit the number of news items in direct mode (default: 10)\n` +
    `  -h, --help            Show this help information\n\n` +
    `${chalk.bold('Interactive Mode:')}\n` +
    `  Run without flags to enter the interactive menu where you can:\n` +
    `  - Browse headlines\n` +
    `  - Select and open articles in your web browser\n` +
    `  - Perform new searches interactively\n` +
    `  - Refresh the feed on-demand`,
    { padding: 1, borderStyle: 'round', borderColor: 'yellow', margin: 1 }
  ));
}

// Non-interactive Mode (Direct output to console)
async function directMode(query, limit) {
  const spinner = ora(`Fetching top ${limit} anime news items for "${query}"...`).start();
  try {
    const articles = await fetchNews(query);
    spinner.succeed(`Fetched ${articles.length} news items`);

    const displayedArticles = articles.slice(0, limit);
    if (displayedArticles.length === 0) {
      console.log(chalk.yellow(`No articles found for query: "${query}"`));
      return;
    }

    const formattedList = displayedArticles.map((art, idx) => {
      const { title, source } = parseTitleAndSource(art.title);
      const timeStr = formatRelativeTime(art.pubDate);
      return `${chalk.yellow(`[${idx + 1}]`)} ${chalk.white.bold(title)}\n    ${chalk.gray(`Source: ${chalk.cyan(source)} | ${chalk.green(timeStr)}`)}\n    ${chalk.blue.underline(art.link)}`;
    }).join('\n\n');

    console.log(boxen(
      `${chalk.bold.magenta(`Latest News for "${query}"`)}\n\n${formattedList}`,
      { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'magenta' }
    ));
  } catch (err) {
    spinner.fail(`Failed to fetch news: ${err.message}`);
    process.exit(1);
  }
}

// Interactive Terminal UI
async function interactiveMenu(initialQuery = 'anime') {
  let query = initialQuery;
  let articles = [];

  while (true) {
    console.clear();
    const spinner = ora(`Fetching news for "${query}"...`).start();
    try {
      articles = await fetchNews(query);
      spinner.succeed(`Loaded ${articles.length} news items for "${query}"`);
    } catch (err) {
      spinner.fail(`Failed to fetch news: ${err.message}`);
      console.log(chalk.red('\nCould not fetch news. Let\'s try resetting.'));
      await prompts({ type: 'text', name: 'key', message: 'Press Enter to continue...' });
      query = 'anime';
      continue;
    }

    // Limit to top 10 items for the interactive display to keep it readable
    const displayedArticles = articles.slice(0, 10);

    const headerText = chalk.bold.cyan(`Latest Anime News for "${query}"`);
    const formattedList = displayedArticles.map((art, idx) => {
      const { title, source } = parseTitleAndSource(art.title);
      const timeStr = formatRelativeTime(art.pubDate);
      return `${chalk.yellow(`[${idx + 1}]`)} ${chalk.white(title)}\n    ${chalk.gray(`Source: ${chalk.cyan(source)} | Published: ${chalk.green(timeStr)}`)}`;
    }).join('\n\n');

    console.log(boxen(
      `${headerText}\n\n${formattedList || chalk.yellow('No news items found.')}`,
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
    ));

    // Define options for user interaction
    const choices = [];
    if (displayedArticles.length > 0) {
      choices.push({ title: '🔗 Open an article in browser', value: 'open' });
    }
    choices.push(
      { title: '🔍 Search for a specific anime or topic', value: 'search' },
      { title: '🔄 Refresh feed', value: 'refresh' },
      { title: '❌ Exit CLI', value: 'exit' }
    );

    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices
    });

    if (!response.action || response.action === 'exit') {
      console.log(chalk.cyan('\nThank you for using Anime News CLI! Sayonara! 👋\n'));
      break;
    }

    if (response.action === 'refresh') {
      continue;
    }

    if (response.action === 'search') {
      const searchPrompt = await prompts({
        type: 'text',
        name: 'term',
        message: 'Enter anime title or search term:',
        validate: value => value.trim().length > 0 ? true : 'Please enter a search term'
      });
      if (searchPrompt.term) {
        query = searchPrompt.term.trim();
      }
      continue;
    }

    if (response.action === 'open') {
      const articleChoices = displayedArticles.map((art, idx) => {
        const { title } = parseTitleAndSource(art.title);
        const displayTitle = title.length > 70 ? `${title.substring(0, 67)}...` : title;
        return { title: `[${idx + 1}] ${displayTitle}`, value: art.link };
      });
      articleChoices.push({ title: chalk.red('◀ Back to Menu'), value: 'back' });

      const openResponse = await prompts({
        type: 'select',
        name: 'url',
        message: 'Select an article to open:',
        choices: articleChoices
      });

      if (openResponse.url && openResponse.url !== 'back') {
        const openSpinner = ora('Opening article in your default browser...').start();
        try {
          await open(openResponse.url);
          openSpinner.succeed('Opened article successfully!');
        } catch (e) {
          openSpinner.fail(`Failed to open link: ${e.message}`);
        }
        // Keep status visible for a second
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
  }
}

// Main execution function
async function main() {
  const argv = minimist(process.argv.slice(2), {
    alias: {
      s: 'search',
      l: 'limit',
      h: 'help'
    },
    string: ['search'],
    boolean: ['help'],
    default: {
      limit: 10
    }
  });

  if (argv.help) {
    showHelp();
    return;
  }

  // Determine if direct mode should run (either search query or limit was passed explicitly, or if standard input is not a TTY)
  const hasFlags = argv.search !== undefined || process.argv.includes('-l') || process.argv.includes('--limit');
  const isInteractive = !hasFlags && process.stdout.isTTY;

  if (isInteractive) {
    await interactiveMenu('anime');
  } else {
    const query = argv.search || 'anime';
    const limit = parseInt(argv.limit, 10) || 10;
    await directMode(query, limit);
  }
}

main();
