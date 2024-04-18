import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import {User} from '../models/user.model.js';
import {uploadOnCloudinary} from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // adding refresh token to db
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500,'Something went wrong while generating tokens')
    }
}


const registerUser = asyncHandler(async(req,res) => {
    // get user details from frontend.
    // validation --> not empty
    // check if user already exists : using username,email
    // check for images, check for a vatar.
    // upload them to cloudinary. avatar
    // create user objects -> create user entry in db.
    // remove password and refresh token field from response.
    // check if user created successfully -> if true return response else return error.


    // 1-> get user details. 
    // form, body -> in req.body, in url see later;

    const {fullname, email, username, password} = req.body;
    // console.log("Full name:", fullname);
    // console.log("email: ", email);
    // console.log("password: ", password);

    // if (fullname === "") {
    //     throw new ApiError(400,"Fullname is required");
    // }
    if (
        [fullname,email,username,password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are reuired");
    }


    // check for user already exists
    const existedUser = await User.findOne({
        $or: [{ username },{ email }]
    })
    if (existedUser) throw new ApiError(409,"User already exists.");


    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }


    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is required");

    // upload on cloudinary;
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) throw new ApiError(400, "Avatar file is required");

    // creating entry on db

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) throw new ApiError(500, "Something went wrong while registering the user");
    
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registerd Successfully")
    )
});

const loginUser = asyncHandler(async(req,res) => {
    // take data from req.body
    // username or email
    // find the user
    // if user present --> password check
    // if pass is correct --> send access and refresh token
    // send cookie and send response...

    const {email, username, password} = req.body;

    if (!(username || email)) throw new ApiError(400, "username or password required");

    const user = await User.findOne({
        $or: [{username}, {email}]
    });

    if (!user) throw new ApiError(404, "User doesn't exist");

   const isPasswordValid = await user.isPasswordCorrect(password);

   if (!isPasswordValid) throw new ApiError(401, "Invalid Credentials");

   const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);


   // we can also make a new db query and also update it at its place here which operation is less costlier do that.
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

   // sending cookies.

   const options = {
    httpOnly: true, // only can be modified from server you can see in frontend but modify in backend only
    secure: true
   }

   return res
   .status(200)
   .cookie("accessToken",accessToken,options)
   .cookie("refreshToken",refreshToken, options)
   .json(new ApiResponse(200,{
    user: loggedInUser,accessToken,refreshToken
   },
   "User logged in Successfully"
))
});

const logoutUser = asyncHandler(async(req,res) => {
    //to logout remove all the cookies of the user and delete the refreshToken from database.

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
});

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unaouthorized Request");
    }

    try {
        const decoded = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        )

        const user = await User.findById(decoded?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        // now match the incoming and stored refresh token.

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh Token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id);

        return res
        .status(200)
        .cookie("accessToken", accessToken,options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken}
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
});

const changeCurrentPassword = asyncHandler(async (req,res)=> {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async(req,res) => {
    return res
    .status(200)
    .json(200,req.user, "Current User fetched Successfully")
});

const updateAccountDetails = asyncHandler(async(req,res) => {
    const {fullname, email} = req.body;

    if(!fullname || !email) {
        throw new ApiError(400, "All fields are required");
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname: fullname,
                email
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated Successfully"));
});

const updateUserAvatar = asyncHandler(async(req,res) => {
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is missing");

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "Error whie uploading on avatar.");
    }

    await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar Image uploaded Successfully")
    )
});
const updateUserCoverImage = asyncHandler(async(req,res) => {
    const coverImageLocalPath = req.file?.path;
    if (!coverImageLocalPath) throw new ApiError(400, "Cover file is missing");

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "Error whie uploading on cover.");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover Image uploaded Successfully")
    )
});

export {registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails,updateUserAvatar, updateUserCoverImage};