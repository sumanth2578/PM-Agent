import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Meeting {
    id: string;
    date: string;
    summary: string;
}

export function ReminderManager() {
    const [notifiedMeetings, setNotifiedMeetings] = useState<Set<string>>(new Set());

    useEffect(() => {
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const checkReminders = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch upcoming meetings
            const { data: meetings } = await supabase
                .from('meetings')
                .select('id, date, summary')
                .eq('user_email', user.email)
                .eq('is_calendar', true);

            if (!meetings) return;

            const now = new Date();
            const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
            const windowStart = new Date(thirtyMinutesFromNow.getTime() - 60 * 1000); // 1-minute window
            const windowEnd = new Date(thirtyMinutesFromNow.getTime() + 60 * 1000);

            meetings.forEach((meeting: Meeting) => {
                const meetingDate = new Date(meeting.date);

                if (
                    meetingDate >= windowStart &&
                    meetingDate <= windowEnd &&
                    !notifiedMeetings.has(meeting.id)
                ) {
                    // Trigger notification
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('Upcoming Meeting Reminder', {
                            body: `"${meeting.summary}" starts in 30 minutes!`,
                            icon: '/vite.svg' // Fallback icon
                        });

                        setNotifiedMeetings(prev => new Set(prev).add(meeting.id));
                    }
                }
            });
        };

        // Run every 60 seconds
        const interval = setInterval(checkReminders, 60000);
        checkReminders(); // Initial check

        return () => clearInterval(interval);
    }, [notifiedMeetings]);

    return null; // This component doesn't render anything
}
