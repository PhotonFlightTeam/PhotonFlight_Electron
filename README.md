# PhotonFlight_Electron
Repository for the electron application for PhotonFlight. This application utilizes JS React for the front end.  

To run the application:  
1. cd into /PhotonFlight  
2. run npm install  
3. run npm start

Movement Controls:  
Movement can be done with both mouse and keyboard inputs. 
    
For key controls you must hold x, y, or z and an arrow key. 
The letter is the axis  
up/down arrows are changes in camera position  
right/left arrows are changes in camera focus  
(Essentialluy up/down moves along an axis, right/left rotates on an axis)

There are also default positions created for each axis clicking the indicated character jumps to these positions:  
- +z t -topdown view  
- -z b -bottomup view
- +x f -front to back view
- -x v -back to front view
- +y r -right to left view
- -y l -left to right view


Updates Needed:  
- ~~Allowing inputting a file rather than using default .laz~~
- ~~Create view controls~~
- More options for basic color variations
- Creation of a measuring tool
- Portal for interacting with plugins

The JS library for interpreting .las files only supports versions <=1.3; v1.4 files currently need to be converted.  
To do convert a file, follow this sequence:  
1. cd into /LasEditor
2. pip install -r requirements.txt
3. python convert.py