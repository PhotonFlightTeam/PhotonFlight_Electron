import laspy

input_path = input("Enter the path to the LAS 1.4 file: ")
output_path = input("\nEnter the path to save the LAS 1.3 file: ")

# Read the LAS 1.4 file
las_in = laspy.read(input_path)

print(list(las_in.point_format.dimension_names))

# Create a new header with version 1.3 and a compatible point format (0 to 3)
# Note: LAS 1.4 point formats (6-10) are not compatible with LAS 1.3.
new_header = laspy.LasHeader(point_format=3, version="1.3")
new_header.scales = las_in.header.scales
new_header.offsets = las_in.header.offsets

# Create new LasData container
las_out = laspy.LasData(new_header)

# Copy point coordinates and basic attributes
las_out.x = las_in.x
las_out.y = las_in.y
las_out.z = las_in.z
las_out.intensity = las_in.intensity

# I don't think classification is necessary and it sometimes messes things up
#las_out.classification = las_in.classification
if "red" in list(las_in.point_format.dimension_names):
    las_out.red = las_in.red
if "green" in list(las_in.point_format.dimension_names):
    las_out.green = las_in.green
if "blue" in list(las_in.point_format.dimension_names):
    las_out.blue = las_in.blue

# Write out the LAS 1.3 file
las_out.write(output_path)
print(f"Successfully converted {input_path} to {output_path}")
