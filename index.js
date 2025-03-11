const express = require('express');
const natural = require('natural');
const Parser = require('rss-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

// Initialize NLP tools
const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

// Define news sources with RSS feeds
const newsSources = [
  {
    name: 'Times of India',
    feeds: [
      'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', // Top Stories
      'https://timesofindia.indiatimes.com/rssfeeds/1221656.cms',   // India News
      'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms'    // Sports
    ]
  },
  {
    name: 'The Hindu',
    feeds: [
      'https://www.thehindu.com/news/national/feeder/default.rss',     // National
      'https://www.thehindu.com/sport/feeder/default.rss',            // Sports
      'https://www.thehindu.com/news/states/feeder/default.rss',      // States
      'https://www.thehindu.com/business/feeder/default.rss',         // Business
      'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', // Technology
      'https://www.thehindu.com/entertainment/feeder/default.rss',     // Entertainment
      'https://www.thehindu.com/news/cities/feeder/default.rss',      // Cities
      'https://www.thehindu.com/opinion/feeder/default.rss',          // Opinion
      'https://www.thehindu.com/life-and-style/feeder/default.rss'    // Life & Style
    ]
  },
  {
    name: 'Hindustan Times',
    feeds: [
      'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',    // India News
      'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml',        // Sports
      'https://www.hindustantimes.com/feeds/rss/cities/rssfeed.xml',        // Cities
      'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml',      // Business
      'https://www.hindustantimes.com/feeds/rss/education/rssfeed.xml',     // Education
      'https://www.hindustantimes.com/feeds/rss/entertainment/rssfeed.xml', // Entertainment
      'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml',   // World News
      'https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml',   // Technology
      'https://www.hindustantimes.com/feeds/rss/lifestyle/rssfeed.xml'     // Lifestyle
    ]
  }
];

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8'
  },
  timeout: 60000,
  maxRedirects: 5
});

// Enhanced RSS fetching function with better error handling
async function fetchNews(source) {
  try {
    console.log(`Starting to fetch RSS feeds from ${source.name}...`);
    const articles = [];
    
    for (const feedUrl of source.feeds) {
      try {
        console.log(`Fetching feed: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        
        // Process each item in the feed
        for (const item of feed.items.slice(0, 5)) { // Get up to 5 articles per feed
          const fullText = `${item.title || ''} ${item.contentSnippet || item.content || ''}`;
          
          if (fullText.length > 10) {
            const words = tokenizer.tokenize(fullText);
            const sentimentScore = analyzer.getSentiment(words);
            const topic = determineTopic(fullText);
            const entities = extractEntities(fullText);
            const summary = generateSummary(fullText);

            articles.push({
              source: source.name,
              title: item.title,
              topic,
              summary,
              sentimentScore: Math.round(sentimentScore * 100) / 100,
              affectedStates: entities.states,
              keyPeople: entities.people,
              organizations: entities.organizations,
              timestamp: item.pubDate || item.isoDate || new Date().toISOString(),
              contentLength: fullText.length,
              url: item.link,
              category: item.categories || [],
              author: item.creator || item.author || 'Unknown'
            });
          }
        }
      } catch (feedError) {
        console.error(`Error fetching feed ${feedUrl}:`, feedError.message);
      }
    }

    console.log(`Successfully processed ${articles.length} articles from ${source.name}`);
    return articles;

  } catch (error) {
    console.error(`Error processing ${source.name}:`, error.message);
    return [];
  }
}

// API endpoint to get news analysis
app.get('/analyze-news', async (req, res) => {
  try {
    console.log('Starting news analysis...');
    const allArticles = [];
    
    for (const source of newsSources) {
      const articles = await fetchNews(source);
      allArticles.push(...articles);
    }

    console.log(`Analysis complete. Found ${allArticles.length} articles total.`);
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      articleCount: allArticles.length,
      articles: allArticles,
      sourcesScraped: newsSources.map(source => source.name)
    });
  } catch (error) {
    console.error('Error in analyze-news endpoint:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get news by source
app.get('/news/source/:sourceName', async (req, res) => {
  try {
    const { sourceName } = req.params;
    const source = newsSources.find(s => s.name.toLowerCase() === sourceName.toLowerCase());
    
    if (!source) {
      return res.status(404).json({
        status: 'error',
        message: `Source '${sourceName}' not found`,
        availableSources: newsSources.map(s => s.name)
      });
    }

    const articles = await fetchNews(source);
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      source: source.name,
      articleCount: articles.length,
      articles
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get news by topic
app.get('/news/topic/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const allArticles = [];
    
    for (const source of newsSources) {
      const articles = await fetchNews(source);
      allArticles.push(...articles);
    }

    const filteredArticles = allArticles.filter(article => 
      article.topic.toLowerCase() === topic.toLowerCase()
    );

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      topic,
      articleCount: filteredArticles.length,
      articles: filteredArticles
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get available topics
app.get('/topics', (req, res) => {
  const topics = Object.keys(determineTopic('').topics);
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    topics
  });
});

// Get available sources
app.get('/sources', (req, res) => {
  const sources = newsSources.map(source => ({
    name: source.name,
    feedCount: source.feeds.length,
    categories: source.feeds.map(feed => {
      const category = feed.match(/\/([^\/]+)\/(?:rssfeed\.xml|default\.rss|[\d]+\.cms)$/i)?.[1] || 'general';
      return category.replace(/-/g, ' ');
    })
  }));

  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    sourceCount: sources.length,
    sources
  });
});

// Get news by source and topic
app.get('/news/source/:sourceName/topic/:topic', async (req, res) => {
  try {
    const { sourceName, topic } = req.params;
    const source = newsSources.find(s => s.name.toLowerCase() === sourceName.toLowerCase());
    
    if (!source) {
      return res.status(404).json({
        status: 'error',
        message: `Source '${sourceName}' not found`,
        availableSources: newsSources.map(s => s.name)
      });
    }

    const articles = await fetchNews(source);
    const filteredArticles = articles.filter(article => 
      article.topic.toLowerCase() === topic.toLowerCase()
    );

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      source: source.name,
      topic,
      articleCount: filteredArticles.length,
      articles: filteredArticles
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper functions
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function determineTopic(text) {
  const topics = {
    politics: {
      keywords: ['government', 'minister', 'election', 'party', 'parliament', 'political', 'policy', 'vote', 'democracy', 'BJP', 'Congress'],
      weight: 0
    },
    sports: {
      keywords: ['cricket', 'football', 'game', 'match', 'player', 'sport', 'tournament', 'team', 'championship', 'athlete', 'IPL'],
      weight: 0
    },
    agriculture: {
      keywords: ['farmer', 'crop', 'agriculture', 'harvest', 'farming', 'irrigation', 'monsoon', 'rural', 'cultivation'],
      weight: 0
    },
    business: {
      keywords: ['market', 'economy', 'stock', 'company', 'business', 'trade', 'investment', 'finance', 'rupee', 'industry'],
      weight: 0
    },
    technology: {
      keywords: ['tech', 'digital', 'software', 'internet', 'cyber', 'AI', 'startup', 'innovation', 'mobile', 'app'],
      weight: 0
    },
    entertainment: {
      keywords: ['movie', 'film', 'actor', 'music', 'celebrity', 'bollywood', 'song', 'star', 'cinema', 'entertainment'],
      weight: 0
    }
  };

  const words = tokenizer.tokenize(text.toLowerCase());
  
  // Calculate weight for each topic
  for (const [topic, data] of Object.entries(topics)) {
    data.weight = data.keywords.reduce((sum, keyword) => {
      return sum + words.filter(word => word.includes(keyword)).length;
    }, 0);
  }

  // Return topic with highest weight
  const sortedTopics = Object.entries(topics).sort((a, b) => b[1].weight - a[1].weight);
  return sortedTopics[0][1].weight > 0 ? sortedTopics[0][0] : 'general';
}

function generateSummary(text, maxLength = 150) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= 1) return text.substring(0, maxLength);

  const tfidf = new TfIdf();
  sentences.forEach(sentence => tfidf.addDocument(sentence));

  // Score sentences based on term importance
  const sentenceScores = sentences.map((sentence, idx) => {
    let score = 0;
    const terms = tokenizer.tokenize(sentence);
    terms.forEach(term => {
      score += tfidf.tfidf(term, idx);
    });
    return { sentence, score };
  });

  // Get top sentences
  const topSentences = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));

  const summary = topSentences.map(item => item.sentence).join(' ');
  return summary.length > maxLength ? summary.substring(0, maxLength - 3) + '...' : summary;
}

function extractEntities(text) {
  const states = [
    'Delhi', 'Mumbai', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Gujarat',
    'Maharashtra', 'Uttar Pradesh', 'Bengal', 'Punjab', 'Rajasthan',
    'Madhya Pradesh', 'Telangana', 'Andhra Pradesh', 'Haryana',
    'Jharkhand', 'Assam', 'Odisha', 'Chhattisgarh', 'Goa'
  ];
  
  const entities = {
    states: [],
    people: [],
    organizations: []
  };

  // Extract states with variations
  states.forEach(state => {
    const stateRegex = new RegExp(`\\b${state}\\b`, 'gi');
    if (stateRegex.test(text)) {
      entities.states.push(state);
    }
  });

  // Enhanced person detection
  const nameRegex = /(?:[A-Z][a-z]+ ){1,2}(?:[A-Z][a-z]+)/g;
  const possibleNames = text.match(nameRegex) || [];
  entities.people = [...new Set(possibleNames)];

  // Organization detection
  const orgRegex = /(?:[A-Z][a-z]* )*(?:Ltd|Limited|Corp|Corporation|Inc|Incorporated|LLC|LLP|Pvt|Private|Company)/g;
  const possibleOrgs = text.match(orgRegex) || [];
  entities.organizations = [...new Set(possibleOrgs)];

  return entities;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

app.listen(port, () => {
  console.log(`News analyzer app listening at http://localhost:${port}`);
}); 