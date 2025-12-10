## Complete Workflow to Generate and Retrieve Transcripts via Gumlet API

### 1. Ensure a Paid Gumlet Plan  
AI-generated subtitles and transcripts are included free on all paid Gumlet plans. No separate subscription is required—just verify your account is on a paid tier.

***

### 2. Configure Subtitle Generation in Processing Settings  

**Via Dashboard:**  
1. In your Gumlet dashboard, navigate to **Collections → Processing Settings**.  
2. Under **AI generated subtitles**, toggle the switch ON.  
3. In **Additional subtitle languages**, select at least one language (for example, “hi” for Hindi or “en” for English).  
4. Click **Save**.  

**Via API:**  
1. Send a PATCH request to update your collection or video profile:
   ```
   PATCH https://api.gumlet.com/v1/video/collections/{collection_id}
   ```
2. Include this JSON body (example selects Hindi and English):
   ```json
   {
     "processing_settings": {
       "subtitles": {
         "generate_subtitles": {
           "audio_language": "en",
           "subtitle_languages": ["hi","en"]
         }
       }
     }
   }
   ```

***

### 3. Upload or Reprocess the Video  
- If you’re adding subtitles to a brand-new upload, simply upload the video after configuring the processing settings.  
- For an existing video, re-upload the same source file using the asset’s `upload_url` (or click “Reprocess” in the dashboard). This triggers Gumlet’s speech-to-text pipeline.

***

### 4. Verify Processing Completion  
Call the **Get Asset Status** endpoint to confirm your settings took effect and that transcripts were generated:
```
GET https://api.gumlet.com/v1/video/assets/{asset_id}
```
Look for:
- `input.transformations.generate_subtitles.subtitle_languages` contains your selected languages  
- A non-empty `transcription_word_level_timestamps` URL under the asset’s `output` section  

***

### 5. Retrieve Word-Level Transcript JSON  
Once processing is complete, fetch the detailed transcript via:
```
GET https://api.gumlet.com/v1/video/assets/{asset_id}/transcription-word-level-timestamps
```
Example using `curl`:
```bash
curl --request GET \
  --url https://api.gumlet.com/v1/video/assets/{asset_id}/transcription-word-level-timestamps \
  --header 'accept: application/json' \
  --header 'authorization: Bearer YOUR_API_KEY'
```
You will receive a JSON array of words with timing:
```json
[
  { "word": "Welcome", "start": 0.5, "end": 0.9 },
  { "word": "to",      "start": 0.9, "end": 1.0 },
  { "word": "Gumlet",  "start": 1.0, "end": 1.5 }
  …
]
```

***

### 6. (Optional) Download VTT Subtitle Files Directly  
If you only need subtitle text (no detailed timestamps), you can download the VTT files listed under `storage_details.subtitle`. Construct URLs using your `collection_id` and `asset_id`:
```
https://video.gumlet.io/{collection_id}/{asset_id}/{fileName}.vtt
```
For example:
```
https://video.gumlet.io/68b2dd4314a50ac8634c064e/68b56c7e9acc73e3b9227a6c/68b56c7e9acc73e3b9227a6c_0_en.vtt
```
Parse the `.vtt` according to the WebVTT specification to extract on-screen text.

***

## Summary of Endpoints  

1. **Get Asset Details**  
   `GET /video/assets/{asset_id}`  
2. **Update Processing Settings**  
   `PATCH /video/collections/{collection_id}`  
3. **Re-upload / Reprocess Video**  
   Use returned `upload_url` or dashboard “Reprocess”  
4. **Fetch Word-Level Transcript**  
   `GET /video/assets/{asset_id}/transcription-word-level-timestamps`  
5. **Download VTT Files**  
   `https://video.gumlet.io/{collection_id}/{asset_id}/{fileName}.vtt`

Follow these steps in order—configure, process, verify, then retrieve—to successfully generate and consume transcripts for your Gumlet-hosted videos.