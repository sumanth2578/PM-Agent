import React, { useState } from 'react';
import { X, Mail, Copy, Check, Send } from 'lucide-react';

interface EmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  date: string;
  duration: number;
}

export function EmailDialog({ isOpen, onClose, summary, date, duration }: EmailDialogProps) {
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailContent, setEmailContent] = useState('');

  if (!isOpen) return null;

  const generateEmailContent = () => {
    const formattedDate = new Date(date).toLocaleString();
    const formattedDuration = `${Math.floor(duration / 60)} minutes`;

    const subject = `3.0Labs Meeting Summary - ${formattedDate}`;
    const body = `
Meeting Summary (via 3.0Labs)
---------------------------
Date: ${formattedDate}
Duration: ${formattedDuration}

Summary:
${summary}
    `.trim();

    return { subject, body };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const emailList = emails.split(',').map(email => email.trim()).filter(e => e !== '');
    if (emailList.length === 0) {
      setError('Please enter at least one email address');
      return;
    }

    const validEmails = emailList.every(email =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );

    if (!validEmails) {
      setError('Please enter valid email addresses separated by commas');
      return;
    }

    const { subject, body } = generateEmailContent();

    try {
      const mailtoLink = `mailto:${emailList.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;
      setEmailContent(`To: ${emailList.join(', ')}\nSubject: ${subject}\n\n${body}`);
      setError('');
    } catch (err) {
      setError('Unable to open email client. Please copy the content below.');
      setEmailContent(`To: ${emailList.join(', ')}\nSubject: ${subject}\n\n${body}`);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(emailContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleOpenGmail = () => {
    const { subject, body } = generateEmailContent();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emails)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleOpenOutlook = () => {
    const { subject, body } = generateEmailContent();
    const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(emails)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(outlookUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[#0B0C10] border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col z-[110] transition-all scale-100 opacity-100">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Share Summary</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Recipient Email(s)
            </label>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="e.g. sumanth@example.com, team@3.0labs.com"
              className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              rows={2}
            />
            {error && (
              <p className="text-xs text-red-400 mt-2 font-medium">{error}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              type="submit"
              className="px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Open Mail Client
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenGmail}
                className="flex-1 px-3 py-3 bg-red-600/10 text-red-400 font-semibold rounded-xl hover:bg-red-600/20 border border-red-500/20 transition-all text-xs"
              >
                Gmail
              </button>
              <button
                type="button"
                onClick={handleOpenOutlook}
                className="flex-1 px-3 py-3 bg-blue-600/10 text-blue-400 font-semibold rounded-xl hover:bg-blue-600/20 border border-blue-500/20 transition-all text-xs"
              >
                Outlook
              </button>
            </div>
          </div>

          {emailContent && (
            <div className="mb-6 bg-black/40 border border-white/10 rounded-xl p-4 overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Preview Content</span>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-indigo-400 rounded-lg border border-white/10 transition-all"
                >
                  {copied ? (
                    <><Check className="w-3 h-3" /> COPIED</>
                  ) : (
                    <><Copy className="w-3 h-3" /> COPY ALL</>
                  )}
                </button>
              </div>
              <div className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                {emailContent}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
