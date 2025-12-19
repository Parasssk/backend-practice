import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const generateAccessandRefreshTokens = async(userId) => {
    try{
        const user = await User.findById(userId)

        const accessToken = await user.generateAccessToken()
        const refreshToken = await user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken , refreshToken}
    }
    catch(error){
        throw new ApiError(500 , "Something went wrong while generating tokens")
    }
}

const registerUser = asyncHandler(async (req, res) => {

    // 🔴 DEBUG START
    console.log("=========== REGISTER DEBUG ===========");
    console.log("REQ HEADERS 👉", req.headers["content-type"]);
    console.log("REQ BODY 👉", req.body);
    console.log("REQ FILES 👉", req.files);
    console.log("======================================");
    // 🔴 DEBUG END

    const { fullname, email, username, password } = req.body;

    if ([fullname, email, username, password].some(field => !field || field.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (existedUser) {
        throw new ApiError(409, "User with email/username already exist");
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null;

    if (!avatar) {
        throw new ApiError(400, "Avatar upload failed");
    }

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

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    );
});

const loginUser = asyncHandler(async (req , res) => {

    const {email , username , password} = req.body;

    if(!(username || email)){
        throw new ApiError(400 , "username or email required")
    }

    const user = await User.findOne({
        $or: [{username} , {email}]
    })

    if(!user){
        throw new ApiError(404 , "user doesnot exist")
    }

    const isPassValid = await user.isPasswordCorrect(password)

    if(!isPassValid){
        throw new ApiError(401 , "pass incorrect")
    }


    const {accessToken , refreshToken} = await generateAccessandRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"

    }

    return res.status(200).cookie("accessToken" , accessToken , options)
    .cookie("refreshToken" , refreshToken , options)
    .json(
        new ApiResponse(
            200,
            {
             user: loggedInUser , accessToken , refreshToken   
            },
            "User Logged In Successfully!!"
        )
    )
})

const logoutUser = asyncHandler(async (req , res) => {

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {refreshToken: undefined}
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken" , options)
    .clearCookie("refreshToken" , options)
    .json(
        new ApiResponse(
            200, {}, "User loggedOut"
        )
    )

})

export { 
    registerUser,
    loginUser,
    logoutUser
}
