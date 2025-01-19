# T2Eval



## Frontend
Frameworks: React.js (18.3.1)


## Backend

Frameworks: Next.js(13.5.8) and Express(18)


## Libraries 
React Router DOM 


# Image Generation and Upload Pipeline

## Tasks Overview
- Build frontend UI for image upload, GenAI setup, and drawing canvas.
- Set up backend for storing and processing images (PNG/JPG/SVG).
- Integrate Gemini API for image handling.

---

## To-Do List

### **Frontend**
- [ ] Create UI for:
  - [x] Image upload with drag-and-drop.
  - [ ] Drawing canvas.
  - [ ] Displaying GenAI-generated images.
- [ ] Add image preview and editing options.
- [ ] Accessibility Check for User FLow

### **Backend**
- [x] Research Gemini API:
  - [x] Supported formats (PNG/JPG/SVG/URLs).
  - [x] Integration requirements.
- [ ] Set up image storage:
  - [ ] Save images as PNG/JPG or generate URLs.
  - [ ] Test image upload and storage.

### **Deployment Plan**
- [] Create Deployment Plan for Editing Images
- [] Replace the use of dotenv for managing environment variables with a secrets
- [] For file uploads, local storage using multer is not ideal in production; instead, integrate with a cloud storage service like Google Cloud Storage or Amazon S3
- [] Update code to use the new secrets and image storage manager once deployment is set
- [] Deployment Options check


### **Research Plan**
- [] Communication URL Link?
- [] Prompt Testing for Tactile Evaluation

---

### **Decisions**
- [ ] Select file format for iterations (PNG, JPG, or SVG).
- [ ] Determine cloud/local storage for images.
