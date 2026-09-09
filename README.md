# PhotonFlight_Electron
Repository for the electron application for PhotonFlight. This application utilizes JS React for the front end.  

To run the application:  
1. cd into /PhotonFlight  
2. run npm install  
3. run npm start

Updates Needed:  
- Allowing inputting a file rather than using default .laz
- More options for basic color variations
- Creation of a measuring tool
- Portal for interacting with plugins

The JS library for interpreting .las files only supports versions <=1.3; v1.4 files currently need to be converted.  
To do convert a file, follow this sequence:  
1. cd into /LasEditor
2. pip install -r requirements.txt
3. python convert.py