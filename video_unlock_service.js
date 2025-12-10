const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class VideoUnlockService {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'lms_database.db'));
    }

    /**
     * Check if a student can access a video based on test completion requirements
     * @param {number} studentId - Student's user ID
     * @param {number} videoId - Video ID to check access for
     * @returns {Promise<Object>} - Access status and details
     */
    async checkVideoAccess(studentId, videoId) {
        return new Promise((resolve, reject) => {
            // Get video details and course sequence
            const query = `
                SELECT 
                    v.id,
                    v.title,
                    v.sequence,
                    v.course_id,
                    c.title as course_title,
                    tcr.is_required,
                    tcr.passing_score,
                    tcr.max_attempts
                FROM videos v
                JOIN courses c ON v.course_id = c.id
                LEFT JOIN test_completion_requirements tcr ON v.id = tcr.video_id
                WHERE v.id = ?
            `;
            
            this.db.get(query, [videoId], async (err, video) => {
                if (err) {
                    return reject(err);
                }
                
                if (!video) {
                    return resolve({
                        canAccess: false,
                        reason: 'Video not found',
                        videoId,
                        studentId
                    });
                }
                
                try {
                    // Check if this is the first video in the course (always accessible)
                    const isFirstVideo = await this.isFirstVideoInCourse(videoId, video.course_id);
                    if (isFirstVideo) {
                        return resolve({
                            canAccess: true,
                            reason: 'First video in course',
                            videoId,
                            studentId,
                            videoDetails: video
                        });
                    }
                    
                    // Get previous video in sequence
                    const previousVideo = await this.getPreviousVideo(videoId, video.course_id, video.sequence);
                    if (!previousVideo) {
                        return resolve({
                            canAccess: true,
                            reason: 'No previous video found',
                            videoId,
                            studentId,
                            videoDetails: video
                        });
                    }
                    
                    // Check if previous video has test requirements
                    const previousVideoRequirements = await this.getVideoTestRequirements(previousVideo.id);
                    if (!previousVideoRequirements || !previousVideoRequirements.is_required) {
                        // Previous video doesn't require test completion
                        return resolve({
                            canAccess: true,
                            reason: 'Previous video has no test requirements',
                            videoId,
                            studentId,
                            videoDetails: video,
                            previousVideo
                        });
                    }
                    
                    // Check if student has passed the previous video's test
                    const testResult = await this.getStudentTestResult(studentId, previousVideo.id);
                    if (!testResult) {
                        return resolve({
                            canAccess: false,
                            reason: 'Must complete test for previous video',
                            videoId,
                            studentId,
                            videoDetails: video,
                            previousVideo,
                            requiredTest: {
                                videoId: previousVideo.id,
                                videoTitle: previousVideo.title,
                                passingScore: previousVideoRequirements.passing_score
                            }
                        });
                    }
                    
                    if (!testResult.passed) {
                        return resolve({
                            canAccess: false,
                            reason: 'Must pass test for previous video',
                            videoId,
                            studentId,
                            videoDetails: video,
                            previousVideo,
                            testResult,
                            requiredTest: {
                                videoId: previousVideo.id,
                                videoTitle: previousVideo.title,
                                passingScore: previousVideoRequirements.passing_score,
                                currentScore: testResult.percentage_score
                            }
                        });
                    }
                    
                    // Student has passed the required test
                    resolve({
                        canAccess: true,
                        reason: 'Previous video test completed successfully',
                        videoId,
                        studentId,
                        videoDetails: video,
                        previousVideo,
                        testResult
                    });
                    
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Check if a video is the first in its course
     * @param {number} videoId - Video ID
     * @param {number} courseId - Course ID
     * @returns {Promise<boolean>}
     */
    isFirstVideoInCourse(videoId, courseId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT MIN(sequence) as min_sequence
                FROM videos 
                WHERE course_id = ?
            `;
            
            this.db.get(query, [courseId], (err, result) => {
                if (err) {
                    return reject(err);
                }
                
                // Get current video's sequence
                this.db.get('SELECT sequence FROM videos WHERE id = ?', [videoId], (err, video) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    resolve(video && video.sequence === result.min_sequence);
                });
            });
        });
    }

    /**
     * Get the previous video in the course sequence
     * @param {number} currentVideoId - Current video ID
     * @param {number} courseId - Course ID
     * @param {number} currentSequence - Current video sequence
     * @returns {Promise<Object>}
     */
    getPreviousVideo(currentVideoId, courseId, currentSequence) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, title, sequence
                FROM videos 
                WHERE course_id = ? AND sequence < ?
                ORDER BY sequence DESC
                LIMIT 1
            `;
            
            this.db.get(query, [courseId, currentSequence], (err, video) => {
                if (err) {
                    return reject(err);
                }
                
                resolve(video || null);
            });
        });
    }

    /**
     * Get test requirements for a video
     * @param {number} videoId - Video ID
     * @returns {Promise<Object>}
     */
    getVideoTestRequirements(videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT *
                FROM test_completion_requirements
                WHERE video_id = ?
            `;
            
            this.db.get(query, [videoId], (err, requirements) => {
                if (err) {
                    return reject(err);
                }
                
                resolve(requirements || null);
            });
        });
    }

    /**
     * Get student's best test result for a video
     * @param {number} studentId - Student ID
     * @param {number} videoId - Video ID
     * @returns {Promise<Object>}
     */
    getStudentTestResult(studentId, videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    sta.id,
                    sta.percentage_score,
                    sta.passed,
                    sta.completed_at,
                    at.passing_score
                FROM student_test_attempts sta
                JOIN ai_tests at ON sta.test_id = at.id
                WHERE sta.student_id = ? AND at.video_id = ? AND sta.completed_at IS NOT NULL
                ORDER BY sta.percentage_score DESC, sta.completed_at DESC
                LIMIT 1
            `;
            
            this.db.get(query, [studentId, videoId], (err, result) => {
                if (err) {
                    return reject(err);
                }
                
                resolve(result || null);
            });
        });
    }

    /**
     * Get all accessible videos for a student in a course
     * @param {number} studentId - Student ID
     * @param {number} courseId - Course ID
     * @returns {Promise<Array>}
     */
    async getAccessibleVideos(studentId, courseId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    v.id,
                    v.title,
                    v.sequence,
                    v.gumlet_url,
                    tcr.is_required,
                    tcr.passing_score
                FROM videos v
                LEFT JOIN test_completion_requirements tcr ON v.id = tcr.video_id
                WHERE v.course_id = ?
                ORDER BY v.sequence
            `;
            
            this.db.all(query, [courseId], async (err, videos) => {
                if (err) {
                    return reject(err);
                }
                
                try {
                    const accessibleVideos = [];
                    
                    for (const video of videos) {
                        const accessInfo = await this.checkVideoAccess(studentId, video.id);
                        
                        accessibleVideos.push({
                            ...video,
                            canAccess: accessInfo.canAccess,
                            accessReason: accessInfo.reason,
                            isLocked: !accessInfo.canAccess,
                            requiredTest: accessInfo.requiredTest || null
                        });
                    }
                    
                    resolve(accessibleVideos);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Unlock next video after test completion
     * @param {number} studentId - Student ID
     * @param {number} videoId - Video ID that was just completed
     * @returns {Promise<Object>}
     */
    async unlockNextVideo(studentId, videoId) {
        try {
            // Get current video details
            const currentVideo = await this.getVideoDetails(videoId);
            if (!currentVideo) {
                throw new Error('Video not found');
            }
            
            // Get next video in sequence
            const nextVideo = await this.getNextVideo(videoId, currentVideo.course_id, currentVideo.sequence);
            if (!nextVideo) {
                return {
                    unlocked: false,
                    reason: 'No next video in course',
                    currentVideo
                };
            }
            
            // Check if next video is now accessible
            const accessInfo = await this.checkVideoAccess(studentId, nextVideo.id);
            
            return {
                unlocked: accessInfo.canAccess,
                reason: accessInfo.reason,
                currentVideo,
                nextVideo,
                accessInfo
            };
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get video details
     * @param {number} videoId - Video ID
     * @returns {Promise<Object>}
     */
    getVideoDetails(videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT v.*, c.title as course_title
                FROM videos v
                JOIN courses c ON v.course_id = c.id
                WHERE v.id = ?
            `;
            
            this.db.get(query, [videoId], (err, video) => {
                if (err) {
                    return reject(err);
                }
                
                resolve(video || null);
            });
        });
    }

    /**
     * Get the next video in the course sequence
     * @param {number} currentVideoId - Current video ID
     * @param {number} courseId - Course ID
     * @param {number} currentSequence - Current video sequence
     * @returns {Promise<Object>}
     */
    getNextVideo(currentVideoId, courseId, currentSequence) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, title, sequence
                FROM videos 
                WHERE course_id = ? AND sequence > ?
                ORDER BY sequence ASC
                LIMIT 1
            `;
            
            this.db.get(query, [courseId, currentSequence], (err, video) => {
                if (err) {
                    return reject(err);
                }
                
                resolve(video || null);
            });
        });
    }

    /**
     * Get course progress for a student
     * @param {number} studentId - Student ID
     * @param {number} courseId - Course ID
     * @returns {Promise<Object>}
     */
    async getCourseProgress(studentId, courseId) {
        try {
            const videos = await this.getAccessibleVideos(studentId, courseId);
            
            const totalVideos = videos.length;
            const accessibleVideos = videos.filter(v => v.canAccess).length;
            const completedTests = videos.filter(v => v.testCompleted).length;
            
            return {
                totalVideos,
                accessibleVideos,
                completedTests,
                progressPercentage: totalVideos > 0 ? Math.round((accessibleVideos / totalVideos) * 100) : 0,
                testCompletionPercentage: totalVideos > 0 ? Math.round((completedTests / totalVideos) * 100) : 0,
                videos
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close();
    }
}

module.exports = VideoUnlockService;