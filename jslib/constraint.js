import * as cnt from 'contract'

const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const roles = require('roles');
const t = require("tools");
const Boss = require('boss.js');
const e = require("errors");
const BigDecimal  = require("big").Big;

//Operators
const operators = [" defined"," undefined","<=",">=","<",">","!=","=="," matches "," is_a "," is_inherit ","inherits ","inherit "," can_play "];

const DEFINED = 0;
const UNDEFINED = 1;
const LESS_OR_EQUAL = 2;
const MORE_OR_EQUAL = 3;
const LESS = 4;
const MORE = 5;
const NOT_EQUAL = 6;
const EQUAL = 7;
const MATCHES = 8;
const IS_A = 9;
const IS_INHERIT = 10;
const INHERITS = 11;
const INHERIT = 12;
const CAN_PLAY = 13;

//Conversions
const NO_CONVERSION = 0;
const CONVERSION_BIG_DECIMAL = 1;

const compareOperandType = {
    FIELD : 0,
    CONSTSTR  : 1,
    CONSTOTHER : 2
};

//Constraints types
Constraint.TYPE_TRANSACTIONAL = 1;
Constraint.TYPE_EXISTING_DEFINITION = 2;
Constraint.TYPE_EXISTING_STATE = 3;

Constraint.conditionsModeType = {
    all_of : "all_of",
    any_of : "any_of",
    simple_condition : "simple_condition"
};

///////////////////////////
//Constraint
///////////////////////////

function Constraint(contract) {
    this.baseContract = contract;
    this.name = "";
    this.type = Constraint.TYPE_EXISTING_DEFINITION;
    this.transactional_id = "";
    this.contract_id = null;
    this.required = true;
    this.origin = null;
    this.signed_by = [];
    this.fields = [];
    this.roles = [];
    this.matchingItems = [];
    this.conditions = {};
    this.comment = null;
    bs.BiSerializable.call(this);
}

Constraint.prototype = Object.create(bs.BiSerializable.prototype);

Constraint.prototype.deserialize = function(data, deserializer) {

    if(data.hasOwnProperty("name"))
        this.name = data.name;
    else
        this.name = null;

    if(data.hasOwnProperty("type"))
        this.type = data.type;
    else
        this.type = null;

    if(data.hasOwnProperty("comment"))
        this.comment = data.comment;
    else
        this.comment = null;

    if(data.hasOwnProperty("transactional_id"))
        this.transactional_id = data.transactional_id;
    else
        this.transactional_id = "";

    if(data.hasOwnProperty("contract_id") && data.contract_id != null)
        this.contract_id = deserializer.deserialize(data.contract_id);
    else
        this.contract_id = null;

    if(data.hasOwnProperty("origin") && data.origin != null)
        this.origin = deserializer.deserialize(data.origin);
    else
        this.origin = null;

    if(data.hasOwnProperty("signed_by") && data.signed_by != null)
        this.signed_by = deserializer.deserialize(data.signed_by);
    else
        this.signed_by = [];

    if(data.hasOwnProperty("roles") && data.roles != null)
        this.roles = deserializer.deserialize(data.roles);
    else
        this.roles = [];

    if(data.hasOwnProperty("fields") && data.fields != null)
        this.fields = deserializer.deserialize(data.fields);
    else
        this.fields = [];

    if(data.hasOwnProperty("where") && data.where != null)
        this.conditions = deserializer.deserialize(data.where);
    else
        this.conditions = {};
};

Constraint.prototype.serialize = function(serializer) {

    let data = {
        name : this.name,
        type : this.type,
        transactional_id : this.transactional_id,
        required : this.required,
        signed_by : this.signed_by,
        roles : this.roles,
        fields : this.fields,
        where : this.conditions
    };

    if (this.contract_id != null)
        data.contract_id = this.contract_id;

    if (this.origin != null)
        data.origin = this.origin;

    if (this.comment != null)
        data.comment = this.comment;

    return serializer.serialize(data);
};

Constraint.prototype.copy = function() {
    let bbm = BossBiMapper.getInstance();

    return bbm.deserialize(bbm.serialize(this));
};

Constraint.prototype.setConditions = function(conditions) {
    this.conditions = this.parseConditions(conditions);
};

Constraint.prototype.setContract = function(contract) {
    this.baseContract = contract;
};

/*var toType = function(obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}

private long objectCastToTimeSeconds(Object obj, String operand, compareOperandType typeOfOperand) throws Exception {
    long val;

    if ((obj == null) && (typeOfOperand == compareOperandType.FIELD))
        throw new IllegalArgumentException("Error getting operand: " + operand);

    if ((obj != null) && obj.getClass().getName().endsWith("ZonedDateTime"))
        val = ((ZonedDateTime) obj).toEpochSecond();
else if ((obj != null) && obj.getClass().getName().endsWith("String"))
        val = ZonedDateTime.parse((String) obj, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("UTC"))).toEpochSecond();
else if ((obj != null) && isObjectMayCastToLong(obj))
        val = objectCastToLong(obj);
    else if (typeOfOperand == compareOperandType.CONSTSTR)
        val = ZonedDateTime.parse(operand, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("UTC"))).toEpochSecond();
    else if (typeOfOperand == compareOperandType.CONSTOTHER)
        val = Long.parseLong(operand);
    else
        throw new IllegalArgumentException("Error parsing DateTime from operand: " + operand);

    return val;
};*/

Constraint.prototype.objectCastToBigDecimal = function(obj, operand, typeOfOperand) {
    let val;
    if ((obj == null) && (typeOfOperand === compareOperandType.FIELD))
        throw "Error getting operand: " + operand;

    if ((obj != null) && ((typeof obj === "string") || (typeof obj === "number")))
        val = new BigDecimal(obj);
    else if ((typeOfOperand === compareOperandType.CONSTSTR) || (typeOfOperand === compareOperandType.CONSTOTHER))
        val = new BigDecimal(operand);
    else
        throw "Error parsing BigDecimal from operand: " + operand;

    return val;
};

Constraint.prototype.compareOperands = function(refContract,
                                                leftOperand,
                                                rightOperand,
                                                typeOfLeftOperand,
                                                typeOfRightOperand,
                                                isBigDecimalConversion,
                                                indxOperator,
                                                contracts,
                                                iteration) {

    let ret = false;
    let leftOperandContract = null;
    let rightOperandContract = null;
    let left = null;
    let right = null;
    let leftVal = 0;
    let rightVal = 0;
    let leftBigDecimal;
    let rightBigDecimal;
    let isLeftDouble = false;
    let isRightDouble = false;
    let firstPointPos;

    if (leftOperand != null) {
        if (typeOfLeftOperand === compareOperandType.FIELD) {
            if (leftOperand.startsWith("ref.")) {
                leftOperand = leftOperand.substring(4);
                leftOperandContract = refContract;
            } else if (leftOperand.startsWith("this.")) {
                if (this.baseContract == null)
                    throw "Use left operand in condition: " + leftOperand + ". But this contract not initialized.";

                leftOperand = leftOperand.substring(5);
                leftOperandContract = this.baseContract;
            } else if ((firstPointPos = leftOperand.indexOf(".")) > 0) {
                if (this.baseContract == null)
                    throw "Use left operand in condition: " + leftOperand + ". But this contract not initialized.";

                let ref = this.baseContract.findConstraintByName(leftOperand.substring(0, firstPointPos));
                if (ref == null)
                    throw "Not found reference: " + leftOperand.substring(0, firstPointPos);

                for (let checkedContract of contracts)
                    if (ref.isMatchingWith(checkedContract, contracts, iteration + 1))
                        leftOperandContract = checkedContract;

                if (leftOperandContract == null)
                    return false;

                leftOperand = leftOperand.substring(firstPointPos + 1);
            } else
                throw "Invalid format of left operand in condition: " + leftOperand + ". Missing contract field.";

        } else if (typeOfLeftOperand === compareOperandType.CONSTOTHER) {
            if (indxOperator === CAN_PLAY) {
                if (leftOperand === "ref") {
                    leftOperandContract = refContract;
                } else if (leftOperand === "this") {
                    if (this.baseContract == null)
                        throw "Use left operand in condition: " + leftOperand + ". But this contract not initialized.";

                    leftOperandContract = this.baseContract;
                } else {
                    if (this.baseContract == null)
                        throw "Use left operand in condition: " + leftOperand + ". But this contract not initialized.";

                    let ref = this.baseContract.findConstraintByName(leftOperand);
                    if (ref == null)
                        throw "Not found reference: " + leftOperand;

                    for (let checkedContract of contracts)
                        if (ref.isMatchingWith(checkedContract, contracts, iteration + 1))
                            leftOperandContract = checkedContract;

                    if (leftOperandContract == null)
                        return false;
                }
            } else if (leftOperand === "now")
                left = Math.floor(Date.now() / 1000);
        }
    }

    if (rightOperand != null) {     // if != null, rightOperand then FIELD or CONSTANT
        if (typeOfRightOperand === compareOperandType.FIELD) {     // if typeOfRightOperand - FIELD
            if (rightOperand.startsWith("ref.")) {
                rightOperand = rightOperand.substring(4);
                rightOperandContract = refContract;
            } else if (rightOperand.startsWith("this.")) {
                if (this.baseContract == null)
                    throw "Use right operand in condition: " + rightOperand + ". But this contract not initialized.";

                rightOperand = rightOperand.substring(5);
                rightOperandContract = this.baseContract;
            } else if ((firstPointPos = rightOperand.indexOf(".")) > 0) {
                if (this.baseContract == null)
                    throw "Use right operand in condition: " + rightOperand + ". But this contract not initialized.";

                let ref = this.baseContract.findConstraintByName(rightOperand.substring(0, firstPointPos));
                if (ref == null)
                    throw "Not found reference: " + rightOperand.substring(0, firstPointPos);

                for (let checkedContract of contracts)
                    if (ref.isMatchingWith(checkedContract, contracts, iteration + 1))
                        rightOperandContract = checkedContract;

                if (rightOperandContract == null)
                    return false;

                rightOperand = rightOperand.substring(firstPointPos + 1);
            }
            else
                throw "Invalid format of right operand in condition: " + rightOperand + ". Missing contract field.";
        } else if (typeOfRightOperand === compareOperandType.CONSTOTHER) {
            if (rightOperand === "now")
                right = Math.floor(Date.now() / 1000);
        }

        if ((leftOperandContract != null) && (indxOperator !== CAN_PLAY))
            left = leftOperandContract.get(leftOperand);
        if (rightOperandContract != null)
            right = rightOperandContract.get(rightOperand);

        try {
            switch (indxOperator) {
                case LESS:
                case MORE:
                case LESS_OR_EQUAL:
                case MORE_OR_EQUAL:
                    if (typeOfLeftOperand === compareOperandType.FIELD && left == null)
                        break;

                    if (typeOfRightOperand === compareOperandType.FIELD && right == null)
                        break;

                    if (isBigDecimalConversion) {
                        leftBigDecimal = this.objectCastToBigDecimal(left, leftOperand, typeOfLeftOperand);
                        rightBigDecimal = this.objectCastToBigDecimal(right, rightOperand, typeOfRightOperand);

                        if (((indxOperator === LESS) && (leftBigDecimal.cmp(rightBigDecimal) === -1)) ||
                            ((indxOperator === MORE) && (leftBigDecimal.cmp(rightBigDecimal) === 1)) ||
                            ((indxOperator === LESS_OR_EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) < 1)) ||
                            ((indxOperator === MORE_OR_EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) > -1)))
                            ret = true;

                    } else if (((left != null) && left instanceof Date) ||      //todo or Object.prototype.toString.call(date) === '[object Date]'
                        ((right != null) && right instanceof Date)) {
                        let leftTime = objectCastToTimeSeconds(left, leftOperand, typeOfLeftOperand);
                        let rightTime = objectCastToTimeSeconds(right, rightOperand, typeOfRightOperand);

                        if (((indxOperator === LESS) && (leftTime < rightTime)) ||
                            ((indxOperator === MORE) && (leftTime > rightTime)) ||
                            ((indxOperator === LESS_OR_EQUAL) && (leftTime <= rightTime)) ||
                            ((indxOperator === MORE_OR_EQUAL) && (leftTime >= rightTime)))
                            ret = true;
                    } else {
                        if ((typeOfLeftOperand === compareOperandType.FIELD) && (left != null)) {
                            leftVal = left;
                            //if (isLeftDouble = isObjectMayCastToDouble(left))
                            //    leftValD = objectCastToDouble(left);
                            //else
                            //    leftValL = objectCastToLong(left);
                        }

                        if ((typeOfRightOperand === compareOperandType.FIELD) && (right != null)) {
                            rightVal = right;
                            //if (isRightDouble = isObjectMayCastToDouble(right))
                            //    rightValD = objectCastToDouble(right);
                            //else
                            //    rightValL = objectCastToLong(right);
                        }

                        if ((typeOfLeftOperand === compareOperandType.FIELD) && (typeOfRightOperand === compareOperandType.FIELD)) {
                            //if (((indxOperator === LESS) && ((isLeftDouble ? leftValD : leftValL) < (isRightDouble ? rightValD : rightValL))) ||
                            //    ((indxOperator === MORE) && ((isLeftDouble ? leftValD : leftValL) > (isRightDouble ? rightValD : rightValL))) ||
                            //    ((indxOperator === LESS_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) <= (isRightDouble ? rightValD : rightValL))) ||
                            //    ((indxOperator === MORE_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) >= (isRightDouble ? rightValD : rightValL))))
                            if (((indxOperator === LESS) && (leftVal < rightVal)) ||
                                ((indxOperator === MORE) && (leftVal > rightVal)) ||
                                ((indxOperator === LESS_OR_EQUAL) && (leftVal <= rightVal)) ||
                                ((indxOperator === MORE_OR_EQUAL) && (leftVal >= rightVal)))
                                ret = true;
                        }
                       /* else if ((typeOfLeftOperand === compareOperandType.FIELD) && (typeOfRightOperand === compareOperandType.CONSTOTHER)) { // rightOperand is CONSTANT (null | number | true | false)
                            if ((rightOperand !== "null") && (rightOperand !== "false") && (rightOperand !== "true"))
                                if ((rightOperand.indexOf(".") && // todo !!
                                    //(((indxOperator === LESS) && ((isLeftDouble ? leftValD : leftValL) < Double.parseDouble(rightOperand))) ||
                                    //    ((indxOperator === MORE) && ((isLeftDouble ? leftValD : leftValL) > Double.parseDouble(rightOperand))) ||
                                    //    ((indxOperator === LESS_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) <= Double.parseDouble(rightOperand))) ||
                                    //    ((indxOperator === MORE_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) >= Double.parseDouble(rightOperand))))) ||
                                    (((indxOperator === LESS) && (leftVal) < Double.parseDouble(rightOperand))) ||
                                        ((indxOperator === MORE) && ((isLeftDouble ? leftValD : leftValL) > Double.parseDouble(rightOperand))) ||
                                        ((indxOperator === LESS_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) <= Double.parseDouble(rightOperand))) ||
                                        ((indxOperator === MORE_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) >= Double.parseDouble(rightOperand))))) ||

                                    (!rightOperand.indexOf(".") &&
                                        (((indxOperator === LESS) && ((isLeftDouble ? leftValD : leftValL) < Long.parseLong(rightOperand))) ||
                                            ((indxOperator === MORE) && ((isLeftDouble ? leftValD : leftValL) > Long.parseLong(rightOperand))) ||
                                            ((indxOperator === LESS_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) <= Long.parseLong(rightOperand))) ||
                                            ((indxOperator === MORE_OR_EQUAL) && ((isLeftDouble ? leftValD : leftValL) >= Long.parseLong(rightOperand))))))
                                    ret = true;
                        } else if ((typeOfRightOperand === compareOperandType.FIELD) && (typeOfLeftOperand === compareOperandType.CONSTOTHER)) { // leftOperand is CONSTANT (null | number | true | false)
                            if ((leftOperand !== "null") && (leftOperand !== "false") && (leftOperand !== "true"))
                                if ((leftOperand.indexOf(".") &&
                                    (((indxOperator === LESS) && (Double.parseDouble(leftOperand) < (isRightDouble ? rightValD : rightValL))) ||
                                        ((indxOperator === MORE) && (Double.parseDouble(leftOperand) > (isRightDouble ? rightValD : rightValL))) ||
                                        ((indxOperator === LESS_OR_EQUAL) && (Double.parseDouble(leftOperand) <= (isRightDouble ? rightValD : rightValL))) ||
                                        ((indxOperator === MORE_OR_EQUAL) && (Double.parseDouble(leftOperand) >= (isRightDouble ? rightValD : rightValL))))) ||
                                    (!leftOperand.indexOf(".") &&
                                        (((indxOperator === LESS) && (Long.parseLong(leftOperand) < (isRightDouble ? rightValD : rightValL))) ||
                                            ((indxOperator === MORE) && (Long.parseLong(leftOperand) > (isRightDouble ? rightValD : rightValL))) ||
                                            ((indxOperator === LESS_OR_EQUAL) && (Long.parseLong(leftOperand) <= (isRightDouble ? rightValD : rightValL))) ||
                                            ((indxOperator === MORE_OR_EQUAL) && (Long.parseLong(leftOperand) >= (isRightDouble ? rightValD : rightValL))))))
                                    ret = true;
                        } else
                            throw "Invalid operator in condition for string: " + operators[indxOperator];*/
                    }

                    break;

                case NOT_EQUAL:
                /*case EQUAL:
                    if (typeOfLeftOperand === compareOperandType.FIELD && left == null && !rightOperand.equals("null"))
                        break;

                    if (typeOfRightOperand === compareOperandType.FIELD && right == null && !leftOperand.equals("null"))
                        break;

                    if (isBigDecimalConversion) { //todo that's another story
                        leftBigDecimal = objectCastToBigDecimal(left, leftOperand, typeOfLeftOperand);
                        rightBigDecimal = objectCastToBigDecimal(right, rightOperand, typeOfRightOperand);

                        if (((indxOperator === EQUAL) && (leftBigDecimal.compareTo(rightBigDecimal) === 0)) ||
                            ((indxOperator === NOT_EQUAL) && (leftBigDecimal.compareTo(rightBigDecimal) !== 0)))
                            ret = true;
                    }
                    else if (((left != null) && left.getClass().getName().endsWith("HashId")) ||
                        ((right != null) && right.getClass().getName().endsWith("HashId"))) {
                        let leftID;
                        let rightID;

                        if ((left != null) && left.getClass().getName().endsWith("HashId"))
                            leftID = left;
                        else if ((left != null) && left.getClass().getName().endsWith("String"))
                            leftID = HashId.withDigest((String) left);
                        else
                            leftID = HashId.withDigest(leftOperand);

                        if ((right != null) && right.getClass().getName().endsWith("HashId"))
                            rightID = right;
                        else if ((right != null) && right.getClass().getName().endsWith("String"))
                            rightID = HashId.withDigest((String) right);
                        else
                            rightID = HashId.withDigest(rightOperand);

                        ret = leftID.equals(rightID);

                        if (indxOperator === NOT_EQUAL)
                            ret = !ret;
                    } else if (((left != null) && (left.getClass().getName().endsWith("Role") || left.getClass().getName().endsWith("RoleLink"))) ||
                            ((right != null) && (right.getClass().getName().endsWith("Role") || right.getClass().getName().endsWith("RoleLink")))) { // if role - compare with role, key or address
                        if (((left != null) && (left.getClass().getName().endsWith("Role") || left.getClass().getName().endsWith("RoleLink"))) &&
                            ((right != null) && (right.getClass().getName().endsWith("Role") || right.getClass().getName().endsWith("RoleLink")))) {
                            if (((indxOperator === NOT_EQUAL) && !((Role)left).equalsIgnoreName((Role) right)) ||
                                ((indxOperator === EQUAL) && ((Role)left).equalsIgnoreName((Role) right)))
                            ret = true;

                        } else {
                            let role;
                            let compareOperand;
                            if ((left != null) && (left.getClass().getName().endsWith("Role") || left.getClass().getName().endsWith("RoleLink"))) {
                                role = left;
                                if ((right != null) && (right.getClass().getName().endsWith("String")))
                                    compareOperand = right;
                                else
                                    compareOperand = rightOperand;
                            } else {
                                role = right;
                                if ((left != null) && (left.getClass().getName().endsWith("String")))
                                    compareOperand = left;
                                else
                                    compareOperand = leftOperand;
                            }

                            if(role instanceof RoleLink) {
                                role  = role.resolve();
                            }

                            try {
                                compareOperand = compareOperand.replaceAll("\\s+", "");       // for key in quotes

                                if (compareOperand.length > 72) {
                                    // Key
                                    PublicKey publicKey = new PublicKey(Base64u.decodeCompactString(compareOperand));
                                    SimpleRole simpleRole = new SimpleRole(role.getName(), Do.listOf(publicKey));
                                    ret = role.equalsIgnoreName(simpleRole);
                                } else {
                                    // Address
                                    KeyAddress ka = new KeyAddress(compareOperand);
                                    SimpleRole simpleRole = new SimpleRole(role.getName(), Do.listOf(ka));
                                    ret = role.equalsIgnoreName(simpleRole);
                                }
                            }
                            catch (e) {
                                throw "Key or address compare error in condition: " + e.toString();
                            }

                            if (indxOperator === NOT_EQUAL)
                                ret = !ret;

                        }
                    } else if (((left != null) && left instanceof Date) ||
                        ((right != null) && right instanceof Date)) {
                        let leftTime = objectCastToTimeSeconds(left, leftOperand, typeOfLeftOperand);
                        let rightTime = objectCastToTimeSeconds(right, rightOperand, typeOfRightOperand);

                        if (((indxOperator === NOT_EQUAL) && (leftTime !== rightTime)) ||
                            ((indxOperator === EQUAL) && (leftTime === rightTime)))
                            ret = true;
                    } else if ((typeOfLeftOperand === compareOperandType.FIELD) && (typeOfRightOperand === compareOperandType.FIELD)) {   // operands is FIELDs
                        if ((left != null) && (right != null)) {
                            let isNumbers = true;

                            //if (isLeftDouble = isObjectMayCastToDouble(left))
                            //    leftValD = objectCastToDouble(left);
                            //else if (isObjectMayCastToLong(left))
                            //    leftValL = objectCastToLong(left);
                            if (left instanceof Number)
                                leftVal = left;
                            else
                                isNumbers = false;

                            if (isNumbers) {
                                //if (isRightDouble = isObjectMayCastToDouble(right))
                                //    rightValD = objectCastToDouble(right);
                                //else if (isObjectMayCastToLong(right))
                                //    rightValL = objectCastToLong(right);
                                rightVal = right;
                                else
                                    isNumbers = false;
                            }

                            if (isNumbers && ((isLeftDouble && !isRightDouble) || (!isLeftDouble && isRightDouble))) {
                                if (((indxOperator === NOT_EQUAL) && ((isLeftDouble ? leftValD : leftValL) !== (isRightDouble ? rightValD : rightValL))) ||
                                    ((indxOperator === EQUAL) && ((isLeftDouble ? leftValD : leftValL) === (isRightDouble ? rightValD : rightValL))))
                                    ret = true;
                            }
                            else if (((indxOperator === NOT_EQUAL) && !left.equals(right)) ||
                                ((indxOperator === EQUAL) && left.equals(right)))
                                ret = true;
                        }
                    } else {
                        let field;
                        let compareOperand;
                        let typeCompareOperand;
                        if (typeOfLeftOperand === compareOperandType.FIELD) {
                            field = left;
                            compareOperand = rightOperand;
                            typeCompareOperand = typeOfRightOperand;
                        }
                        else if (typeOfRightOperand === compareOperandType.FIELD) {
                            field = right;
                            compareOperand = leftOperand;
                            typeCompareOperand = typeOfLeftOperand;
                        }
                        else
                            throw "At least one operand must be a field";

                        if (typeCompareOperand === compareOperandType.CONSTOTHER) {         // compareOperand is CONSTANT (null|number|true|false)
                            if (!compareOperand.equals("null") && !compareOperand.equals("false") && !compareOperand.equals("true")) {
                                if (field != null)
                                {
                                    if (isObjectMayCastToDouble(field)) {
                                        leftValD = objectCastToDouble(field);
                                        Double leftDouble = new Double(leftValD);

                                        if ((compareOperand.indexOf(".") &&
                                            (((indxOperator === NOT_EQUAL) && !leftDouble.equals(Double.parseDouble(compareOperand))) ||
                                                ((indxOperator === EQUAL) && leftDouble.equals(Double.parseDouble(compareOperand))))) ||
                                            (!compareOperand.indexOf(".") &&
                                                (((indxOperator === NOT_EQUAL) && (leftValD !== Long.parseLong(compareOperand))) ||
                                                    ((indxOperator === EQUAL) && (leftValD === Long.parseLong(compareOperand))))))
                                            ret = true;
                                    } else {
                                        leftValL = objectCastToLong(field);
                                        Long leftLong = new Long(leftValL);

                                        if ((!compareOperand.indexOf(".") &&
                                            (((indxOperator === NOT_EQUAL) && !leftLong.equals(Long.parseLong(compareOperand))) ||
                                                ((indxOperator === EQUAL) && leftLong.equals(Long.parseLong(compareOperand))))) ||
                                            (compareOperand.indexOf(".") &&
                                                (((indxOperator === NOT_EQUAL) && (leftValL !== Double.parseDouble(compareOperand))) ||
                                                    ((indxOperator === EQUAL) && (leftValL === Double.parseDouble(compareOperand))))))
                                            ret = true;
                                    }
                                }
                            } else {          // if compareOperand : null|false|true
                                if (((indxOperator === NOT_EQUAL) &&
                                    ((compareOperand.equals("null") && (field != null)) ||
                                        (compareOperand.equals("true") && ((field != null) && !(boolean) field)) ||
                                (compareOperand.equals("false") && ((field != null) && (boolean) field))))
                            || ((indxOperator === EQUAL) &&
                                    ((compareOperand.equals("null") && (field == null)) ||
                                        (compareOperand.equals("true") && ((field != null) && (boolean) field)) ||
                                (compareOperand.equals("false") && ((field != null) && !(boolean) field)))))
                                ret = true;
                            }
                        } else if (typeCompareOperand == compareOperandType.CONSTSTR) {          // compareOperand is CONSTANT (string)
                            if ((field != null) &&
                                (((indxOperator === NOT_EQUAL) && !field.equals(compareOperand)) ||
                                    ((indxOperator === EQUAL) && field.equals(compareOperand))))
                                ret = true;
                        }
                        else
                            throw "Invalid type of operand: " + compareOperand;
                    }

                    break;*/

                case MATCHES:

                    break;
                /*case IS_INHERIT:
                    // deprecate warning
                    console.log("WARNING: Operator 'is_inherit' was deprecated. Use operator 'is_a'.");
                case IS_A:
                    if ((left == null) || !left.getClass().getName().endsWith("Reference"))
                        throw "Expected reference in condition in left operand: " + leftOperand;

                    if ((right == null) || !right.getClass().getName().endsWith("Reference"))
                        throw "Expected reference in condition in right operand: " + rightOperand;

                    ret = ((Reference) left).isInherited((Reference) right, refContract, contracts, iteration + 1);

                    break;
                case INHERIT:
                    // deprecate warning
                    console.log("WARNING: Operator 'inherit' was deprecated. Use operator 'inherits'.");
                case INHERITS:
                    if ((right == null) || !right.getClass().getName().endsWith("Reference"))
                        throw"Expected reference in condition in right operand: " + rightOperand;

                    ret = ((Reference) right).isMatchingWith(refContract, contracts, iteration + 1);

                    break;
                case CAN_PLAY:
                    if ((right == null) || !(right.getClass().getName().endsWith("Role") || right.getClass().getName().endsWith("RoleLink")))
                        throw "Expected role in condition in right operand: " + rightOperand;

                    Set<PublicKey> keys;
                    if (leftOperand.equals("this"))
                        keys = leftOperandContract.getEffectiveKeys();
                    else
                        keys = leftOperandContract.getSealedByKeys();

                    ret = ((Role) right).isAllowedForKeys(keys);

                    break;*/
                default:
                    throw "Invalid operator in condition";
            }
        }
        catch (e) {
            throw "Error compare operands in condition: " + e.toString();
        }
    } else {       // if rightOperand == null, then operation: defined / undefined
        if (indxOperator === DEFINED) {
            try {
                if (leftOperandContract.get(leftOperand) != null)
                    ret = true;
            } catch (e) {}
        } else if (indxOperator === UNDEFINED) {
            try {
                ret = (leftOperandContract.get(leftOperand) == null);
            }
            catch (e) {
                ret = true;
            }
        }
        else
            throw "Invalid operator in condition";
    }

    return ret;
};

Constraint.prototype.parseCondition = function(condition) {

    let leftConversion = NO_CONVERSION;
    let rightConversion = NO_CONVERSION;

    for (let i = 0; i < 2; i++) {
        let operPos = condition.lastIndexOf(operators[i]);

        if ((operPos >= 0) && (condition.length - operators[i].length === operPos)) {

            let leftOperand = condition.substring(0, operPos).replace(/\s/g, "");

            if (leftOperand.endsWith("::number")) {
                leftConversion = CONVERSION_BIG_DECIMAL;
                leftOperand = leftOperand.substring(0, leftOperand.length - 8);
            }

            return {
                operator: i,
                leftOperand: leftOperand,
                rightOperand: null,
                typeOfLeftOperand: compareOperandType.FIELD,
                typeOfRightOperand: compareOperandType.CONSTOTHER,
                leftConversion: leftConversion,
                rightConversion: rightConversion
            };
        }
    }

    for (let i = 2; i < INHERITS; i++) {
        let operPos = condition.indexOf(operators[i]);
        let firstMarkPos = condition.indexOf("\"");
        let lastMarkPos = condition.lastIndexOf("\"");

        // Normal situation - operator without quotes
        while ((operPos >= 0) && ((firstMarkPos >= 0) && (operPos > firstMarkPos) && (operPos < lastMarkPos)))
            operPos = condition.indexOf(operators[i], operPos + 1);

        // Operator not found
        if (operPos < 0)
            continue;

        // Parsing left operand
        let subStrL = condition.substring(0, operPos);
        if (subStrL.length === 0)
            throw "Invalid format of condition: " + condition + ". Missing left operand.";

        let lmarkPos1 = subStrL.indexOf("\"");
        let lmarkPos2 = subStrL.lastIndexOf("\"");

        if ((lmarkPos1 >= 0) && (lmarkPos1 === lmarkPos2))
            throw "Invalid format of condition: " + condition + ". Only one quote is found for left operand.";

        let leftOperand;
        let typeLeftOperand = compareOperandType.CONSTOTHER;

        if ((lmarkPos1 >= 0) && (lmarkPos1 !== lmarkPos2)) {
            leftOperand = subStrL.substring(lmarkPos1 + 1, lmarkPos2);
            typeLeftOperand = compareOperandType.CONSTSTR;
        }
        else {
            leftOperand = subStrL.replace(/\s/g, "");
            let firstPointPos;
            if (((firstPointPos = leftOperand.indexOf(".")) > 0) &&
                (leftOperand.length > firstPointPos + 1) &&
                ((leftOperand.charAt(firstPointPos + 1) < '0') ||
                 (leftOperand.charAt(firstPointPos + 1) > '9')))
                typeLeftOperand = compareOperandType.FIELD;
        }

        // Parsing right operand
        let subStrR = condition.substring(operPos + operators[i].length);
        if (subStrR.length === 0)
            throw "Invalid format of condition: " + condition + ". Missing right operand.";

        let rmarkPos1 = subStrR.indexOf("\"");
        let rmarkPos2 = subStrR.lastIndexOf("\"");

        if ((rmarkPos1 >= 0) && (rmarkPos1 === rmarkPos2))
            throw "Invalid format of condition: " + condition + ". Only one quote is found for rigth operand.";

        let rightOperand;
        let typeRightOperand = compareOperandType.CONSTOTHER;

        if ((rmarkPos1 >= 0) && (rmarkPos1 !== rmarkPos2)) {
            rightOperand = subStrR.substring(rmarkPos1 + 1, rmarkPos2);
            typeRightOperand = compareOperandType.CONSTSTR;
        }
        else {
            rightOperand = subStrR.replace(/\s/g, "");
            let firstPointPos;
            if (((firstPointPos = rightOperand.indexOf(".")) > 0) &&
                (rightOperand.length > firstPointPos + 1) &&
                ((rightOperand.charAt(firstPointPos + 1) < '0') ||
                 (rightOperand.charAt(firstPointPos + 1) > '9')))
                typeRightOperand = compareOperandType.FIELD;
        }

        if ((typeLeftOperand === compareOperandType.FIELD) && (leftOperand.endsWith("::number"))) {
            leftConversion = CONVERSION_BIG_DECIMAL;
            leftOperand = leftOperand.substring(0, leftOperand.length - 8);
        }

        if ((typeRightOperand === compareOperandType.FIELD) && (rightOperand.endsWith("::number"))) {
            rightConversion = CONVERSION_BIG_DECIMAL;
            rightOperand = rightOperand.substring(0, rightOperand.length - 8);
        }

        return {
            operator: i,
            leftOperand: leftOperand,
            rightOperand: rightOperand,
            typeOfLeftOperand: typeLeftOperand,
            typeOfRightOperand: typeRightOperand,
            leftConversion: leftConversion,
            rightConversion: rightConversion
        };
    }

    for (let i = INHERITS; i <= INHERIT; i++) {
        let operPos = condition.indexOf(operators[i]);

        if ((operPos === 0) || ((operPos > 0) && (condition.charAt(operPos - 1) !== '_'))) {
            let subStrR = condition.substring(operPos + operators[i].length);
            if (subStrR.length === 0)
                throw "Invalid format of condition: " + condition + ". Missing right operand.";

            let rightOperand = subStrR.replace(/\s/g, "");

            if (rightOperand.endsWith("::number")) {
                rightConversion = CONVERSION_BIG_DECIMAL;
                rightOperand = rightOperand.substring(0, rightOperand.length - 8);
            }

            return {
                operator: i,
                leftOperand: null,
                rightOperand: rightOperand,
                typeOfLeftOperand: compareOperandType.FIELD,
                typeOfRightOperand: compareOperandType.FIELD,
                leftConversion: leftConversion,
                rightConversion: rightConversion
            };
        }
    }

    let operPos = condition.indexOf(operators[CAN_PLAY]);
    if (operPos > 0) {
        // Parsing left operand
        let subStrL = condition.substring(0, operPos);
        if (subStrL.length === 0)
            throw "Invalid format of condition: " + condition + ". Missing left operand.";

        let leftOperand = subStrL.replace(/\s/g, "");
        if (~leftOperand.indexOf("."))
            throw "Invalid format of condition: " + condition + ". Left operand must be a reference to a contract.";

        let subStrR = condition.substring(operPos + operators[CAN_PLAY].length);
        if (subStrR.length === 0)
            throw "Invalid format of condition: " + condition + ". Missing right operand.";

        // Parsing right operand
        let rightOperand = subStrR.replace(/\s/g, "");
        let firstPointPos;
        if (!(((firstPointPos = rightOperand.indexOf(".")) > 0) &&
            (rightOperand.length > firstPointPos + 1) &&
            ((rightOperand.charAt(firstPointPos + 1) < '0') ||
             (rightOperand.charAt(firstPointPos + 1) > '9'))))
            throw "Invalid format of condition: " + condition + ". Right operand must be a role field.";

        return {
            operator: CAN_PLAY,
            leftOperand: leftOperand,
            rightOperand: rightOperand,
            typeOfLeftOperand: compareOperandType.CONSTOTHER,
            typeOfRightOperand: compareOperandType.FIELD,
            leftConversion: leftConversion,
            rightConversion: rightConversion
        };
    }

    throw "Invalid format of condition: " + condition;
};

Constraint.prototype.checkCondition = function(condition, ref, contracts, iteration) {

    let typeOfLeftOperand;
    let typeOfRightOperand;

    let leftOperand = condition.leftOperand;
    let rightOperand = condition.rightOperand;
    let operator = condition.operator;

    let typeLeftOperand = condition.typeOfLeftOperand;
    let typeRightOperand = condition.typeOfRightOperand;

    if (typeLeftOperand === 0)
        typeOfLeftOperand = compareOperandType.FIELD;
    else if (typeLeftOperand === 1)
        typeOfLeftOperand = compareOperandType.CONSTSTR;
    else
        typeOfLeftOperand = compareOperandType.CONSTOTHER;

    if (typeRightOperand === 0)
        typeOfRightOperand = compareOperandType.FIELD;
    else if (typeRightOperand === 1)
        typeOfRightOperand = compareOperandType.CONSTSTR;
    else
        typeOfRightOperand = compareOperandType.CONSTOTHER;

    let leftConversion = condition.leftConversion; // NO_CONVERSION
    let rightConversion = condition.rightConversion; // NO_CONVERSION

    let isBigDecimalConversion = (leftConversion === CONVERSION_BIG_DECIMAL) || (rightConversion === CONVERSION_BIG_DECIMAL);

    return compareOperands(ref, leftOperand, rightOperand, typeOfLeftOperand, typeOfRightOperand, isBigDecimalConversion, operator, contracts, iteration);
};


Constraint.prototype.parseConditions = function(conds) {

    if ((conds == null) || (conds === {}))
        return {};

    if (conds.hasOwnProperty("operator"))
        return conds;

    let all = conds.hasOwnProperty(Constraint.conditionsModeType.all_of);
    let any = conds.hasOwnProperty(Constraint.conditionsModeType.any_of);

    if (all || any) {
        let result = {};
        let keyName = all ? Constraint.conditionsModeType.all_of : Constraint.conditionsModeType.any_of;
        let parsedList = [];
        let condList = conds[keyName];

        if (condList == null)
            throw "Expected all_of or any_of conditions";

        for (let item of condList) {
            if (typeof item === "string")
                parsedList.push(this.parseCondition(item));
            else {
                let parsed = this.parseConditions(item);
                if ((parsed != null) && (parsed !== {}))
                    parsedList.push(parsed);
            }
        }

        result[keyName] = parsedList;
        return result;
    }
    else
        throw "Expected all_of or any_of";
};

Constraint.prototype.checkConditions =  function(conditions, ref, contracts, iteration) {

    let result;

    if ((conditions == null) || (conditions === {}))
        return true;

    if (conditions.hasOwnProperty(conditionsModeType.all_of))
    {
        let condList = conditions[conditionsModeType.all_of];

        if (condList == null)
            throw "Expected all_of conditions";

        result = true;
        for (let item of condList) {
            if (item instanceof String)
                result = result && this.checkCondition(item, ref, contracts, iteration);      // not pre-parsed (old) version
            /*else                                                                       //todo postponed until test
                //LinkedHashMap<String, Binder> insideHashMap = (LinkedHashMap<String, Binder>) item;
                //Binder insideBinder = new Binder(insideHashMap);
                result = result && this.checkConditions(item, ref, contracts, iteration);*/
        }
    }
    else if (conditions.hasOwnProperty(conditionsModeType.any_of))
    {
        let condList = conditions[conditionsModeType.any_of];

        if (condList == null)
            throw "Expected any_of conditions";

        result = false;
        for (let item of condList) {
            if (item instanceof String)
                result = result || this.checkCondition(item, ref, contracts, iteration);        // not pre-parsed (old) version
            /*else                                                                          //todo postponed until test
                //LinkedHashMap<String, Binder> insideHashMap = (LinkedHashMap<String, Binder>) item;
                //Binder insideBinder = new Binder(insideHashMap);
                result = result || this.checkConditions((Binder) item, ref, contracts, iteration);*/
        }
    }
    else if (conds.hasOwnProperty("operator"))                                                    // pre-parsed version
        result = this.checkCondition(conditions, ref, contracts, iteration);
    else
        throw "Expected all_of or any_of";

    return result;
};

Constraint.prototype.isMatchingWith = function(contract, contracts) {
    return this.isMatchingWithIteration(contract, contracts, 0);
};

Constraint.prototype.isMatchingWithIteration = function(contract, contracts, iteration) {
    //todo: add this checking for matching with given item

    if (iteration > 16)
        throw "Recursive checking references have more 16 iterations";

    let result = true;

    if (contract instanceof cnt.Contract) {
        //check roles
        if (result) {
            if (this.roles.length !== 0) {
                result = false;
                for (let i = 0; i < this.roles.length; i++)
                    if (contract.roles.hasOwnProperty(this.roles[i])) {
                        result = true;
                        break;
                    }
            }
        }

        //check origin
        if (result)
            result = (this.origin == null || !(contract.getOrigin().equals(this.origin)));

        //check fields
        if (result) {
            if ((this.fields.length !== 0) && (contract.state != null) && (contract.state.data != null)) {
                result = false;
                for (let i = 0; i < this.fields.length; i++)
                    if (contract.state.data.hasOwnProperty(this.fields[i])) {
                        result = true;
                        break;
                    }
            }
        }

        //check conditions
        if (result)
            result = this.checkConditions(this.conditions, contract, contracts, iteration);
    }

    return result;
};

Constraint.prototype.isInherited = function (conditions, ref, refContract, contracts, iteration) {

    if ((conditions == null) || (conditions === {}))
        return false;

    let condList = null;

    if (conditions.hasOwnProperty(conditionsModeType.all_of))
    {
        condList = conditions[conditionsModeType.all_of];
        if (condList == null)
            throw "Expected all_of conditions";
    }
    else if (conditions.hasOwnProperty(conditionsModeType.any_of))
    {
        condList = conditions[conditionsModeType.any_of];
        if (condList == null)
            throw "Expected any_of conditions";
    }
    else if (conditions.hasOwnProperty("operator"))
        return this.isInheritedParsed(conditions, ref, refContract, contracts, iteration);
    else
        throw "Expected all_of or any_of";

    if (condList != null)
        for (let item of condList)
    if (item instanceof String) {
        if (this.isInherited(item, ref, refContract, contracts, iteration))
        return true;
    }
    //else if (this.isInherited((Binder) item, ref, refContract, contracts, iteration)) //todo postponed until test
    //return true;

    return false;
};

Constraint.prototype.isInheritedParsed = function (condition, ref, refContract, contracts, iteration) {

    let operator = condition.operator; // todo !!
    let rightOperand = condition.rightOperand;

    if (((operator === INHERITS) || (operator === INHERIT)) && (rightOperand != null))
        return this.isInheritedOperand(rightOperand, ref, refContract, contracts, iteration);

    return false;
};


Constraint.prototype.isInherited = function (condition, ref, refContract, contracts, iteration) {
    for (let i = INHERITS; i <= INHERIT; i++) {
        let operPos = condition.indexOf(operators[i]);

        if ((operPos === 0) || ((operPos > 0) && (condition.charAt(operPos - 1) !== '_'))) {
            let subStrR = condition.substring(operPos + operators[i].length);
            if (subStrR.length === 0)
                throw "Invalid format of condition: " + condition + ". Missing right operand.";

            let rightOperand = subStrR.replaceAll("\\s+", ""); // todo replaceAll

            return this.isInheritedOperand(rightOperand, ref, refContract, contracts, iteration);
        }
    }

    return false;
};


Constraint.prototype.isInheritedOperand = function (rightOperand, ref, refContract, contracts, iteration) {

    let rightOperandContract = null;
    let right = null;
    let firstPointPos;

    if (rightOperand.startsWith("ref.")) {
        rightOperand = rightOperand.substring(4);
        rightOperandContract = refContract;
    } else if (rightOperand.startsWith("this.")) {
        if (this.baseContract == null)
            throw "Use right operand in condition: " + rightOperand + ". But this contract not initialized.";

        rightOperand = rightOperand.substring(5);
        rightOperandContract = this.baseContract;
    } else if ((firstPointPos = rightOperand.indexOf(".")) > 0) {
        if (this.baseContract == null)
            throw "Use right operand in condition: " + rightOperand + ". But this contract not initialized.";

        let refLink = this.baseContract.findConstraintByName(rightOperand.substring(0, firstPointPos));
        if (refLink == null)
            throw "Not found reference: " + rightOperand.substring(0, firstPointPos);

        for (let checkedContract of contracts)
            if (refLink.isMatchingWith(checkedContract, contracts, iteration + 1))
                rightOperandContract = checkedContract;

        if (rightOperandContract == null)
            return false;

        rightOperand = rightOperand.substring(firstPointPos + 1);
    } else
        throw "Invalid format of right operand in condition: " + rightOperand + ". Missing contract field.";

    if (rightOperandContract != null)
        right = rightOperandContract.get(rightOperand);

    if ((right == null) || !right.getClass().getName().endsWith("Reference"))
        throw "Expected reference in condition in right operand: " + rightOperand;

    if (right.equals(ref))
        return true;

    return false;
};

Constraint.prototype.assemblyCondition = function(condition) {

    if ((condition == null) || (condition === {}))
        return null;

    let result = "";

    // get parsed data
    let leftOperand = condition.leftOperand;
    let rightOperand = condition.rightOperand;
    let operator = condition.operator;

    let leftConversion = condition.leftConversion; //NO_CONVERSION
    let rightConversion = condition.rightConversion; //NO_CONVERSION

    let typeLeftOperand = condition.typeOfLeftOperand;
    let typeRightOperand = condition.typeOfRightOperand;

    // assembly condition
    if (leftOperand != null) {
        if (typeLeftOperand === 1)      // CONSTSTR
            result += "\"";

        result += leftOperand;

        if (typeLeftOperand === 1)      // CONSTSTR
            result += "\"";

        if (leftConversion === CONVERSION_BIG_DECIMAL)
            result += "::number";
    }

    result += operators[operator];

    if (rightOperand != null) {
        if (typeRightOperand === 1)      // CONSTSTR
            result += "\"";

        result += rightOperand;

        if (typeRightOperand === 1)      // CONSTSTR
            result += "\"";

        if (rightConversion === CONVERSION_BIG_DECIMAL)
            result += "::number";
    }

    return result;
};

/*
Constrain.prototype.assemblyConditions = function(conds) {

    if ((conds == null) || (conds === {}))
        return null;

    let all = conds.hasOwnProperty(conditionsModeType.all_of.name());
    let any = conds.hasOwnProperty(conditionsModeType.any_of.name());

    if (all || any) {

        let result = {};
        let keyName = all ? all_of.name() : any_of.name();

        let assembledList = [];

        let condList = conds[keyName];

        if (condList == null)
            throw "Expected all_of or any_of conditions";

        for (let item of condList) {
            if (item instanceof String)       // already assembled condition
                assembledList.add(item);
            else {
                Binder parsed = null;
                String cond = null;
                if (item.getClass().getName().endsWith("LinkedHashMap")) {
                    LinkedHashMap<String, Binder> insideHashMap = (LinkedHashMap<String, Binder>) item;
                    Binder insideBinder = new Binder(insideHashMap);
                    parsed = this.assemblyConditions(insideBinder);
                } else if (((Binder) item).hasOwnProperty("operator"))
                cond = this.assemblyCondition((Binder) item);
            else
                parsed = this.assemblyConditions((Binder) item);

                if (parsed != null)
                    assembledList.add(parsed);

                if (cond != null)
                    assembledList.add(cond);
            }
        }

        result.put(keyName, assembledList);
        return result;
    }
    else
        throw "Expected all_of or any_of";
};

Constrain.prototype.equals = function(a) {
    //let dataThis = serialize(new BiSerializer());
    //Binder dataA = a.serialize(new BiSerializer());
    //return dataThis.equals(dataA);
};*/

DefaultBiMapper.registerAdapter(new bs.BiAdapter("Reference", Constraint));
DefaultBiMapper.registerAdapter(new bs.BiAdapter("Constraint", Constraint));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Constraint};