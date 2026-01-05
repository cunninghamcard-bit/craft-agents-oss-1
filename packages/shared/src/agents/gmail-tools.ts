/**
 * Gmail MCP Server
 *
 * Creates an in-process MCP server providing Gmail API tools:
 * - gmail_list_messages: List emails with optional search query
 * - gmail_get_message: Get full email content by ID
 * - gmail_search: Search emails using Gmail syntax
 * - gmail_trash_message: Move email to trash (recoverable for 30 days)
 * - gmail_create_draft: Create a draft email for later review
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { debug } from '../utils/debug.ts';
import { estimateTokens, summarizeLargeResult, TOKEN_LIMIT } from '../utils/summarize.ts';

/**
 * Token getter function - called before each request to get a fresh token
 * This allows token refresh during long-running sessions
 */
export type GmailTokenGetter = () => Promise<string>;

/**
 * Create an authenticated Gmail client from a token getter
 */
async function getGmailClient(getToken: GmailTokenGetter): Promise<gmail_v1.Gmail> {
  const token = await getToken();
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return gmail({ version: 'v1', auth });
}

/**
 * Extract header value from message
 */
function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | undefined {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

/**
 * Extract plain text body from message parts
 */
function extractTextBody(part: gmail_v1.Schema$MessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    // SDK returns base64url encoded data
    return Buffer.from(part.body.data, 'base64url').toString('utf-8');
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      const text = extractTextBody(subPart);
      if (text) return text;
    }
  }

  // Fall back to HTML if no plain text
  if (part.mimeType === 'text/html' && part.body?.data) {
    const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

/**
 * Format message for display
 */
function formatMessage(message: gmail_v1.Schema$Message): string {
  const headers = message.payload?.headers;
  const from = getHeader(headers, 'From') || 'Unknown';
  const to = getHeader(headers, 'To') || '';
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const date = getHeader(headers, 'Date') || '';

  let body = '';
  if (message.payload) {
    if (message.payload.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64url').toString('utf-8');
    } else if (message.payload.parts) {
      body = extractTextBody(message.payload);
    }
  }

  return `
From: ${from}
To: ${to}
Date: ${date}
Subject: ${subject}

${body || message.snippet || '(no content)'}
`.trim();
}

/**
 * Format message list item
 */
function formatMessageListItem(message: gmail_v1.Schema$Message): string {
  const headers = message.payload?.headers;
  const from = getHeader(headers, 'From') || 'Unknown';
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const date = getHeader(headers, 'Date') || '';

  return `[${message.id}] ${date} | ${from} | ${subject}`;
}

/**
 * Create Gmail list messages tool
 */
function createListMessagesTool(getToken: GmailTokenGetter) {
  return tool(
    'gmail_list_messages',
    `List emails from Gmail inbox.

Use this to browse recent emails or search for specific messages.
Returns message IDs, subjects, senders, and snippets.

Common queries:
- Empty query: Get recent messages
- "from:someone@example.com": Messages from specific sender
- "subject:meeting": Messages with subject containing "meeting"
- "is:unread": Unread messages
- "has:attachment": Messages with attachments
- "after:2024/01/01": Messages after a date`,
    {
      query: z.string().optional().describe('Gmail search query (optional). Examples: "from:user@example.com", "is:unread", "subject:invoice"'),
      maxResults: z.number().min(1).max(100).optional().describe('Maximum number of messages to return (default: 10, max: 100)'),
      _intent: z.string().optional().describe('REQUIRED: Describe what you are looking for in these emails'),
    },
    async (args) => {
      const { query, maxResults = 10, _intent } = args;

      try {
        const client = await getGmailClient(getToken);

        debug(`[gmail-tools] Listing messages with query: ${query || '(none)'}`);

        // Get message IDs
        const listResponse = await client.users.messages.list({
          userId: 'me',
          maxResults,
          q: query || undefined,
        });

        const messageRefs = listResponse.data.messages;
        if (!messageRefs || messageRefs.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No messages found.' }],
          };
        }

        // Fetch metadata for each message
        const messages: gmail_v1.Schema$Message[] = [];
        for (const ref of messageRefs) {
          if (!ref.id) continue;
          const msgResponse = await client.users.messages.get({
            userId: 'me',
            id: ref.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });
          messages.push(msgResponse.data);
        }

        // Format output
        const output = messages.map(formatMessageListItem).join('\n');
        const resultText = `Found ${messages.length} messages:\n\n${output}`;

        // Check if response needs summarization
        const estimatedTokens = estimateTokens(resultText);
        if (estimatedTokens > TOKEN_LIMIT && _intent) {
          debug(`[gmail-tools] Response too large (~${estimatedTokens} tokens), summarizing...`);
          const summary = await summarizeLargeResult(resultText, {
            toolName: 'gmail_list_messages',
            input: { query, maxResults },
            modelIntent: _intent,
          });
          return {
            content: [{
              type: 'text' as const,
              text: `[Large response summarized]\n\n${summary}`,
            }],
          };
        }

        return { content: [{ type: 'text' as const, text: resultText }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Failed to list messages: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create Gmail get message tool
 */
function createGetMessageTool(getToken: GmailTokenGetter) {
  return tool(
    'gmail_get_message',
    `Get full email content by message ID.

Use this after listing messages to read the complete content of a specific email.
Returns the full email including headers, body, and metadata.`,
    {
      messageId: z.string().describe('Gmail message ID (from gmail_list_messages)'),
      _intent: z.string().optional().describe('REQUIRED: Describe what information you need from this email'),
    },
    async (args) => {
      const { messageId, _intent } = args;

      try {
        const client = await getGmailClient(getToken);

        debug(`[gmail-tools] Getting message: ${messageId}`);

        const response = await client.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });

        const formatted = formatMessage(response.data);

        // Check if response needs summarization
        const estimatedTokens = estimateTokens(formatted);
        if (estimatedTokens > TOKEN_LIMIT && _intent) {
          debug(`[gmail-tools] Response too large (~${estimatedTokens} tokens), summarizing...`);
          const summary = await summarizeLargeResult(formatted, {
            toolName: 'gmail_get_message',
            input: { messageId },
            modelIntent: _intent,
          });
          return {
            content: [{
              type: 'text' as const,
              text: `[Long email summarized]\n\n${summary}`,
            }],
          };
        }

        return { content: [{ type: 'text' as const, text: formatted }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Failed to get message: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create Gmail search tool
 */
function createSearchTool(getToken: GmailTokenGetter) {
  return tool(
    'gmail_search',
    `Search emails using Gmail's powerful search syntax.

Search operators:
- from:sender - Messages from specific sender
- to:recipient - Messages to specific recipient
- subject:text - Messages with text in subject
- has:attachment - Messages with attachments
- filename:name - Messages with specific attachment filename
- is:unread / is:read - Unread/read messages
- is:starred - Starred messages
- is:important - Important messages
- label:name - Messages with specific label
- after:YYYY/MM/DD - Messages after date
- before:YYYY/MM/DD - Messages before date
- older_than:Xd / newer_than:Xd - Relative date (d=days, m=months, y=years)
- larger:Xm - Messages larger than X megabytes
- "exact phrase" - Exact phrase match

Combine operators: from:boss@company.com after:2024/01/01 has:attachment`,
    {
      query: z.string().describe('Gmail search query'),
      maxResults: z.number().min(1).max(50).optional().describe('Maximum results (default: 20)'),
      _intent: z.string().optional().describe('REQUIRED: Describe what you are searching for'),
    },
    async (args) => {
      const { query, maxResults = 20, _intent } = args;

      try {
        const client = await getGmailClient(getToken);

        debug(`[gmail-tools] Searching: ${query}`);

        const listResponse = await client.users.messages.list({
          userId: 'me',
          maxResults,
          q: query,
        });

        const messageRefs = listResponse.data.messages;
        if (!messageRefs || messageRefs.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No messages found for query: ${query}` }],
          };
        }

        // Fetch metadata for each message
        const messages: gmail_v1.Schema$Message[] = [];
        for (const ref of messageRefs) {
          if (!ref.id) continue;
          const msgResponse = await client.users.messages.get({
            userId: 'me',
            id: ref.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });
          messages.push(msgResponse.data);
        }

        // Format output
        const output = messages.map(formatMessageListItem).join('\n');
        const resultText = `Search results for "${query}" (${messages.length} messages):\n\n${output}`;

        // Check if response needs summarization
        const estimatedTokens = estimateTokens(resultText);
        if (estimatedTokens > TOKEN_LIMIT && _intent) {
          debug(`[gmail-tools] Response too large (~${estimatedTokens} tokens), summarizing...`);
          const summary = await summarizeLargeResult(resultText, {
            toolName: 'gmail_search',
            input: { query, maxResults },
            modelIntent: _intent,
          });
          return {
            content: [{
              type: 'text' as const,
              text: `[Large response summarized]\n\n${summary}`,
            }],
          };
        }

        return { content: [{ type: 'text' as const, text: resultText }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Search failed: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create Gmail trash message tool
 */
function createTrashMessageTool(getToken: GmailTokenGetter) {
  return tool(
    'gmail_trash_message',
    `Move an email to trash.

IMPORTANT: Always ask for explicit user permission before trashing emails.
List the emails to be trashed and wait for user confirmation.

Trashed emails can be recovered from the Trash folder for 30 days.
For permanent deletion, users must empty trash manually in Gmail.`,
    {
      messageId: z.string().describe('Gmail message ID to trash'),
    },
    async (args) => {
      const { messageId } = args;

      try {
        const client = await getGmailClient(getToken);

        debug(`[gmail-tools] Trashing message: ${messageId}`);

        await client.users.messages.trash({
          userId: 'me',
          id: messageId,
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Message ${messageId} moved to trash. It can be recovered from Trash within 30 days.`,
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Failed to trash message: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create Gmail draft tool
 */
function createDraftTool(getToken: GmailTokenGetter) {
  return tool(
    'gmail_create_draft',
    `Create a draft email in Gmail.

The draft will be saved but NOT sent. User can review and send it from Gmail.
Use this when the user wants to compose an email for later review.`,
    {
      to: z.string().describe('Recipient email address(es), comma-separated for multiple'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email body content (plain text)'),
      cc: z.string().optional().describe('CC recipients, comma-separated (optional)'),
      bcc: z.string().optional().describe('BCC recipients, comma-separated (optional)'),
    },
    async (args) => {
      const { to, subject, body, cc, bcc } = args;

      try {
        const client = await getGmailClient(getToken);

        // Build RFC 2822 formatted email
        const emailLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
        ];

        if (cc) emailLines.push(`Cc: ${cc}`);
        if (bcc) emailLines.push(`Bcc: ${bcc}`);

        emailLines.push('Content-Type: text/plain; charset=utf-8');
        emailLines.push('');
        emailLines.push(body);

        const email = emailLines.join('\r\n');

        // Encode as base64url
        const encodedEmail = Buffer.from(email)
          .toString('base64url');

        debug(`[gmail-tools] Creating draft to: ${to}`);

        const response = await client.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: { raw: encodedEmail },
          },
        });

        const draft = response.data;

        return {
          content: [{
            type: 'text' as const,
            text: `Draft created successfully!\n\nDraft ID: ${draft.id}\nTo: ${to}\nSubject: ${subject}\n\nThe draft has been saved in Gmail. You can review and send it from the Drafts folder.`,
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: `Failed to create draft: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create an in-process MCP server with Gmail tools.
 *
 * @param getToken - Function that returns a fresh Gmail OAuth access token
 *                   Called before each request to support token refresh during long sessions
 * @returns SDK MCP server that can be passed to query()
 */
export function createGmailServer(getToken: GmailTokenGetter): ReturnType<typeof createSdkMcpServer> {
  debug('[gmail-tools] Creating Gmail MCP server');

  return createSdkMcpServer({
    name: 'gmail',
    version: '1.0.0',
    tools: [
      createListMessagesTool(getToken),
      createGetMessageTool(getToken),
      createSearchTool(getToken),
      createTrashMessageTool(getToken),
      createDraftTool(getToken),
    ],
  });
}
